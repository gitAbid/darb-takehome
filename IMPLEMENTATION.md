# Implementation Notes

How the receipt & invoice matching workflow is designed, **why** each decision was made over its alternatives, and
what I would do with more time.

- Architecture, folder map, interfaces and flow diagrams → [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Every test scenario with its data and expected outcome → [`docs/SCENARIOS.md`](docs/SCENARIOS.md)
- Every business rule and the test that proves it → [`docs/TEST-INVENTORY.md`](docs/TEST-INVENTORY.md)

## At a glance

- **Precision over recall.** A wrong auto-attachment is silent and costly in a VAT-compliance product; a review is
  cheap. The matcher auto-matches only when every gate passes and explains every other outcome with reason codes.
- **Matcher = filters → weighted signals → decision gates.** Pure, deterministic, and explainable per signal; the
  spec's six edge cases plus seven more realistic traps (shared card digits, OCR misreads, back-to-back refuels,
  foreign currency, unknown sender, a document arriving after one is already confirmed) are all covered.
- **Never lose, never duplicate.** Insert-first idempotency on message id and content hash, enforced by the database;
  failures after the response end in `FAILED` with a reason; a `500` only when nothing was persisted.
- **The database enforces the rules** — one confirmed document per transaction, lifecycle invariants — through
  unique and `CHECK` constraints, not UI logic.
- **Lean, rule-driven tests:** every business rule has a test (inventory linked above); scenario volume lives in one
  end-to-end table that drives the real webhooks; ~99 % statement and ~96 % branch coverage.

## Contents

1. [The problem, in one paragraph](#1-the-problem-in-one-paragraph)
2. [Guiding principle: precision over recall](#2-guiding-principle-precision-over-recall)
3. [Matching engine](#3-matching-engine)
4. [Merchant name normalization and similarity](#4-merchant-name-normalization-and-similarity)
5. [Ingestion and idempotency](#5-ingestion-and-idempotency)
6. [Data model](#6-data-model)
7. [Review actions](#7-review-actions)
8. [Decision log](#8-decision-log)
9. [Assumptions](#9-assumptions)
10. [Requirement traceability](#10-requirement-traceability)
11. [Risk register](#11-risk-register)
12. [Multi-transaction invoices (design sketch)](#12-multi-transaction-invoices-design-sketch)
13. [With more time](#13-with-more-time)

---

## 1. The problem, in one paragraph

Every card purchase exists twice: once as the **card network's record** (noisy acquirer merchant name, charged amount
including tip, UTC timestamp, full card identity) and once as the **document** the driver or supplier sends (real
merchant name, pre-tip total, local date, maybe the last 4 card digits). There is no shared key, so matching is
**probabilistic record linkage**. Documents arrive through unreliable channels (redeliveries, resends, late arrivals,
unreadable photos), so the pipeline must never lose or duplicate one.

## 2. Guiding principle: precision over recall

The two possible errors do not cost the same:

| Error                                  | What happens                                                           | Cost                    |
| -------------------------------------- | ---------------------------------------------------------------------- | ----------------------- |
| **False positive** — wrong auto-attach | Nobody looks again; a VAT claim rests on wrong evidence until an audit | High, silent, delayed   |
| **False negative** — sent to review    | A reviewer spends ~30 seconds                                          | Low, visible, immediate |

So the system **automates only what it is sure about and routes the grey zone to people, with reasons.** Every
threshold and gate below follows from this.

---

## 3. Matching engine

`matchDocument(doc, transactions)` in `lib/services/transaction-matcher.ts` is a **pure function**: no I/O, no clock,
no randomness. Same input → same output, which is what makes it exhaustively testable.

### 3.1 Inputs and outputs

```ts
interface ExtractedFields {
  documentType: 'RECEIPT' | 'TAX_INVOICE' | 'UNKNOWN';
  merchantName: string | null;
  totalAmount: number | null; // halalas
  currency: string | null;
  documentDate: string | null; // ISO 8601, may be date-only
  cardLast4: string | null;
  extractionConfidence: number; // 0..1
  scope: SenderScope; // who sent it → which transactions it may match
}

interface SenderScope {
  clientIds: number[];
  driverPhone: string | null; // set for WhatsApp: only this driver's transactions
}

interface CandidateTransaction {
  id: number;
  clientId: number;
  driverPhone: string | null;
  cardLast4: string;
  merchantName: string;
  mcc: string;
  amount: number;
  currency: string;
  transactionAt: Date;
  hasConfirmedDocument: boolean;
}

interface MatchCandidate {
  transactionId: number;
  confidence: number; // 0..1
  signals: Record<string, number>; // only signals that were measurable (see 3.4)
  flags: CandidateFlag[]; // e.g. AMOUNT_TIP_TOLERANCE, CARD_POSSIBLE_MISREAD
}

interface MatchResult {
  outcome: 'AUTO_MATCHED' | 'NEEDS_REVIEW' | 'UNMATCHED';
  candidates: MatchCandidate[]; // ranked, best first, only those >= review threshold
  reasons: ReasonCode[]; // why this outcome
  excluded: Record<FilterName, number>; // how many transactions each hard filter removed
}
```

The spec's `MatchCandidate`/`MatchResult` shapes are kept and **extended** (`flags`, `reasons`, `excluded`) — the spec
says "design your own scoring", and explainability is graded.

### 3.2 Pipeline

```mermaid
flowchart TD
  IN["ExtractedFields + CandidateTransaction[]"] --> M{"Matchable?<br/>type ≠ UNKNOWN,<br/>amount and date present"}
  M -- no --> U1["UNMATCHED · NOT_MATCHABLE"]
  M -- yes --> F["Hard filters (in order)<br/>1 scope → 2 currency → 3 date window → 4 amount plausibility → 5 card mismatch"]
  F --> S["Score each survivor<br/>amount · date · merchant · card (+ scope = 1)"]
  S --> W["Weighted score over present signals<br/>rank: score ↓, |day gap| ↑, time ↑, id ↑"]
  W --> K{"Any candidate<br/>≥ 0.50?"}
  K -- "none survived filters" --> U2["UNMATCHED · NO_CANDIDATES"]
  K -- "survivors all < 0.50" --> U3["UNMATCHED · LOW_SCORE"]
  K -- yes --> G{"All auto gates pass<br/>for the top candidate?"}
  G -- yes --> A["AUTO_MATCHED · ALL_GATES_PASSED"]
  G -- no --> R["NEEDS_REVIEW · one reason per failed gate"]
```

The design separates three questions that a plain weighted sum mixes up:

1. **Filters** — _could this transaction possibly be the one?_ (binary, removes candidates)
2. **Score** — _how similar is it?_ (0..1, ranks candidates, explains itself via `signals`)
3. **Gates** — _is it safe to act without a human?_ (decides the outcome)

### 3.3 Hard filters

A transaction failing any filter is removed and counted in `excluded`.

| #   | Filter          | Removes a transaction when…                                                   | Why it is a filter, not a score                                                     |
| --- | --------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | **Scope**       | `clientId ∉ scope.clientIds`, or (WhatsApp) `driverPhone ≠ scope.driverPhone` | Matching across clients is a data leak, not a "low score"                           |
| 2   | **Currency**    | Both currencies known and different                                           | E4: settled SAR amounts; a 150 AED receipt is not comparable to 153 SAR             |
| 3   | **Date window** | `d = docDay − txnDay` outside **−3…+1** (receipt) or **−1…+30** (tax invoice) | Bounds the search; invoices are legitimately issued days/weeks after the purchase   |
| 4   | **Amount**      | Amount class is `NONE` (see 3.4)                                              | In a fleet, merchant/card/date repeat constantly — amount is the main discriminator |
| 5   | **Card**        | Both last4 present and **≥ 2 digits** differ                                  | One differing digit is a plausible OCR misread; two is a different card             |

Days are **Riyadh calendar days** (UTC+3). A purchase at 01:30 Riyadh time is the previous day in UTC (see T04 in the
scenarios). Date-only strings (`"2025-06-14"`) are read as Riyadh dates, never as UTC midnight.

### 3.4 Signals

Each signal is a `SignalScorer` (Strategy pattern, one file each). A signal that cannot be measured — the receipt has
no merchant name or no card digits — is **omitted** from `signals` and from the weighting, never scored as 0:
penalizing a receipt for not printing card digits would be wrong.

| Signal       | Value                                                                                                                     | Weight |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- | -----: |
| **amount**   | `EXACT` (\|diff\| ≤ 5 halalas) → **1.0** · `TIP` → **0.7** + flag · `NEAR` (\|diff\| ≤ 1 %) → **0.5** · `NONE` → filtered |   0.40 |
| **date**     | \|d\| = 0 → **1.0** · 1 → **0.8** · 2 → **0.6** · 3 → **0.4** · 4–7 → **0.2** · 8+ → **0.1** (invoices only)              |   0.20 |
| **merchant** | Similarity of normalized names, 0..1 (section 4)                                                                          |   0.20 |
| **card**     | Equal → **1.0** · one digit differs → **0.3** + flag `CARD_POSSIBLE_MISREAD`                                              |   0.20 |
| **scope**    | Always **1** for survivors — recorded so the breakdown shows it was checked                                               |      0 |

`TIP` = the card was charged **more** than the receipt, by at most **20 %**, at a restaurant (MCC **5812/5814**).
Tips are directional (the charge never goes _down_) and only exist where people tip; a fuel station charging 10 %
more than its receipt is a different purchase (scenario U05).

**Why these weights.** Amount carries 40 % because it is the only field that both sides record precisely and that
varies between a driver's purchases. Date, merchant and card are each weaker on their own — a fleet driver refuels at
the same station with the same card several times a week — so they share the rest equally rather than pretending to
a precision we have no data for. Scope has weight 0 because it is a filter: every survivor has it.

### 3.5 Decision gates

The top-ranked candidate is **auto-matched only if every gate passes**. Each failed gate adds its reason code.

| Gate                                  | Threshold                             | Reason if it fails                          | Why                                                                                                               |
| ------------------------------------- | ------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Score high enough                     | ≥ **0.85**                            | `BELOW_AUTO_THRESHOLD`                      | Exact amount + same-ish day + one strong identity signal clears it; a 3-day gap with no card does not (U03)       |
| Amount is exact                       | amount = 1.0                          | `AMOUNT_TIP_TOLERANCE` / `AMOUNT_NOT_EXACT` | VAT evidence must show the charged amount; a tip is plausible, not proven                                         |
| Identity corroborated                 | card = 1.0 **or** merchant ≥ **0.80** | `WEAK_IDENTITY`                             | Amount + date alone renormalize to a high score from thin evidence (U02)                                          |
| Clear winner                          | top − second ≥ **0.10**               | `NEAR_TIE`                                  | One day of date difference moves a score by only 0.04–0.05; that must not decide alone (S12)                      |
| OCR is trustworthy                    | `extractionConfidence` ≥ **0.80**     | `LOW_OCR_CONFIDENCE`                        | The OCR's own doubt about its fields is a reason to ask a human (U01)                                             |
| Transaction has no confirmed document | `hasConfirmedDocument = false`        | `TXN_ALREADY_HAS_DOCUMENT`                  | Spec rule; also the second line of defence against **re-photographed** duplicates, which a byte hash cannot catch |
| No warning flags                      | `flags` empty                         | the flag itself                             | e.g. `CARD_POSSIBLE_MISREAD` keeps the candidate but needs eyes (S09)                                             |

Candidates are kept (and persisted) only if they score ≥ **0.50** — below that, showing them to a reviewer wastes
time. At most **5** are stored. Everything lives in `matching-config.ts`, one typed object.

### 3.6 Reason codes

| Outcome        | Reason codes                                                                                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTO_MATCHED` | `ALL_GATES_PASSED`                                                                                                                                                         |
| `NEEDS_REVIEW` | `BELOW_AUTO_THRESHOLD`, `AMOUNT_TIP_TOLERANCE`, `AMOUNT_NOT_EXACT`, `WEAK_IDENTITY`, `NEAR_TIE`, `LOW_OCR_CONFIDENCE`, `TXN_ALREADY_HAS_DOCUMENT`, `CARD_POSSIBLE_MISREAD` |
| `UNMATCHED`    | `NOT_MATCHABLE`, `NO_CANDIDATES`, `LOW_SCORE` — plus `UNKNOWN_SENDER`, set by the processor before the matcher runs                                                        |

### 3.7 Worked examples

All scenarios, with their full arithmetic, are in [`docs/SCENARIOS.md`](docs/SCENARIOS.md#3-end-to-end-scenarios-fixtures--seed).
The spec's six edge cases:

| Spec edge case                       | Scenario | Top score | Outcome                                      |
| ------------------------------------ | -------- | --------: | -------------------------------------------- |
| 1. Exact match                       | S01      |      1.00 | `AUTO_MATCHED` (runner-up 0.88, margin 0.12) |
| 2. Same amount, same day, same chain | S02      |      1.00 | `NEEDS_REVIEW` · `NEAR_TIE`                  |
| 3. Tip (57.50 vs 63.25)              | S03      |      0.88 | `NEEDS_REVIEW` · `AMOUNT_TIP_TOLERANCE`      |
| 4. Same photo twice                  | S04      |         — | No new document (`contentHash`)              |
| 5. Transaction doesn't exist yet     | S05      |         — | `UNMATCHED` · `NO_CANDIDATES`                |
| 6. Garbage extraction                | S06      |         — | `UNMATCHED` · `NOT_MATCHABLE`, no crash      |

S03 shows why gates exist: on score alone (0.88 ≥ 0.85) the tip would auto-match.

### 3.8 These are scores, not probabilities

There is no labelled data, so 0.85 is a **reasoned threshold, not a measured one**. Each value above is justified by
walking the scenario matrix, not by fitting. The honest path to calibration is already built into the data model:
every persisted candidate stores its `signals`, and every reviewer confirm/reject is a label. With a few thousand
decisions, a logistic regression over `signals` gives learned weights and a probability-calibrated auto threshold.

**Alternatives considered:**

| Approach                                   | Why not (now)                                                                                                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plain weighted sum + one threshold         | Lets strong merchant/date compensate for a wrong amount, inflates thin evidence, averages away contradictions                                                                      |
| Fellegi–Sunter (log-likelihood per signal) | The principled record-linkage model, but its m/u probabilities would be guessed without data, and it is harder to explain to a reviewer. The right next step **once** labels exist |
| ML model                                   | No training data; not explainable to auditors on day one                                                                                                                           |

---

## 4. Merchant name normalization and similarity

Acquirer strings are abbreviated and noisy (`ALFANAR FUEL ST 04 RUH`); receipts print the trading name
(`Alfanar Fuel Station`). Two swappable pieces handle this, each behind an interface.

**`MerchantNormalizer`** turns a name into a token list:

1. Unicode-normalize, strip diacritics, lowercase; `&` → `and`; drop apostrophes (`McDonald's` → `mcdonalds`).
2. Non-alphanumerics → space; split into tokens.
3. Drop tokens containing digits (`04`, `#1234`), store markers (`st`, `stn`, `station`, `br`, `branch`, `no`),
   legal suffixes (`co`, `company`, `llc`, `ltd`, `est`, `trading`), articles (`al`, `the`, `and`), and city codes
   (`ruh`, `jed`, `dmm`, `mak`, `med`, `khb`, `riyadh`, `jeddah`, `dammam`, …).
4. Expand a small abbreviation map (`svc` → `service`).

`ALFANAR FUEL ST 04 RUH` → `[alfanar, fuel]` and `Alfanar Fuel Station` → `[alfanar, fuel]`.

**`StringSimilarity`** (default: weighted token Dice with Jaro–Winkler):

- Tokens are paired one-to-one, greedily by highest Jaro–Winkler; a pair counts if JW ≥ 0.88 (absorbs typos and
  abbreviations like `alfnr`).
- **Generic category words** (`fuel`, `petrol`, `gas`, `grill`, `restaurant`, `cafe`, `car`, `wash`, `auto`,
  `service`, `market`, …) weigh **0.3**; distinctive words weigh **1.0** — so `rawabi fuel` vs `alfanar fuel` shares
  only `fuel` and scores **0.23**, not 0.5.
- `score = 2 · Σ(pair weight × JW) / (Σ weights A + Σ weights B)` ∈ [0, 1].

**Trade-off — store numbers are discarded.** It makes `ST 04` vs `Station 04` match, but it also means station 04 and
station 11 look identical (scenario S02 → review). Keeping numbers would separate them only when the receipt prints the
station number _and_ OCR reads it correctly; a wrong guess there would cause a confident wrong match, which section 2
says is the worse error.

**Known limitation:** an Arabic receipt (`الفنار`) against a Latin acquirer name scores 0. Transliteration is listed in
[With more time](#13-with-more-time); the result today is a review or unmatched, never a wrong auto-match.

**Alternatives considered:** plain Levenshtein on the whole string (punished by word order and extra tokens);
trigram similarity (good, but weaker on short brand names); a merchant master table keyed by VAT number (best signal,
but needs data we don't have — listed under more time).

---

## 5. Ingestion and idempotency

Flow diagrams: [`docs/ARCHITECTURE.md` § Flows](docs/ARCHITECTURE.md#5-flows).

### 5.1 Idempotency keys

| Key           | Value                                                  | Catches                                                   |
| ------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| `externalId`  | Email: `messageId:attachmentIndex` · WhatsApp: `wamid` | Provider **redelivery** of the same message               |
| `contentHash` | SHA-256 of the file bytes (computed by us)             | The **same file** resent under a new message, any channel |

Both are `UNIQUE` columns. Intake is **insert-first**: it tries to insert and treats a unique-constraint violation
(Prisma `P2002`) as "duplicate". A check-then-insert would let two concurrent redeliveries both pass the check.

The WhatsApp payload's own `sha256` is **not** trusted as the key — we hash the bytes we actually fetched.

### 5.2 When things happen

| Step                                                | Where                       | Why there                                                             |
| --------------------------------------------------- | --------------------------- | --------------------------------------------------------------------- |
| Validate payload (Zod), adapt to `InboundMessage[]` | Request (sync)              | Bad input must get a `400` immediately                                |
| Resolve sender → scope                              | Request (sync)              | Cheap lookup; stored on the document                                  |
| Fetch WhatsApp media, hash bytes                    | Request (sync, 3 s timeout) | The hash is the dedupe key and must exist **before** the insert (D17) |
| Insert `Document` (`RECEIVED`)                      | Request (sync)              | Once this commits, the document can never be lost                     |
| Respond                                             | Request                     | `200` with a per-message result                                       |
| Extract → match → persist                           | `after()` (post-response)   | Slow and failure-prone; must never delay or fail the webhook          |

### 5.3 HTTP contract

| Situation                                                    | Status | Body                                                                                                                                          |
| ------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Accepted (any mix of created / duplicate / ignored messages) | 200    | `{ results: [{ externalId, result: 'created', documentId } \| { …, result: 'duplicate', duplicateOf } \| { …, result: 'ignored', reason }] }` |
| Missing or wrong signature (secret configured, section 5.6)  | 401    | `{ error: 'MISSING_SIGNATURE' }` or `{ error: 'INVALID_SIGNATURE' }` — checked before the body is parsed                                      |
| Malformed envelope                                           | 400    | `{ error: 'INVALID_PAYLOAD', issues: [{ path, message }] }`                                                                                   |
| Could not persist (e.g. database down)                       | 500    | `{ error: 'INTERNAL' }` — nothing was saved, so the provider's retry is exactly what we want                                                  |

"Never 500 because extraction or matching failed" holds by construction: those run after the response. A `500` is
only possible **before** anything is persisted, which is the one case where a retry is correct.

### 5.4 Failure mapping

| Failure                                             | Document ends as | `failureReason` / reason |
| --------------------------------------------------- | ---------------- | ------------------------ |
| WhatsApp media id unknown or fetch timed out        | `FAILED`         | `MEDIA_UNAVAILABLE`      |
| Extractor throws                                    | `FAILED`         | `EXTRACTION_ERROR`       |
| Extractor output fails Zod validation               | `FAILED`         | `EXTRACTION_INVALID`     |
| Unexpected error while matching or persisting       | `FAILED`         | `PROCESSING_ERROR`       |
| Extracted, but `UNKNOWN` type / no amount / no date | `UNMATCHED`      | `NOT_MATCHABLE`          |
| Sender maps to no client                            | `UNMATCHED`      | `UNKNOWN_SENDER`         |

---

### 5.5 Re-matching when a transaction arrives (bonus B2)

A receipt often arrives **before** its card transaction is settled (scenario S05). `POST /api/transactions` is the
card-feed entry point: Zod-validated, idempotent on `externalRef` (feeds redeliver too: `201` created, `200` duplicate),
and it checks that the card belongs to the client. After the response, `RematchService`:

1. finds `UNMATCHED`, matchable documents of that client (or sent by that driver) whose date could pair with the
   transaction under any document type's window;
2. re-runs the **same `MatchStage`** as first-time processing (`UNMATCHED → MATCHED / NEEDS_REVIEW`; staying
   unmatched writes nothing);
3. **never re-proposes a transaction already proposed for the document** — including candidates a reviewer
   rejected — so a human decision is never asked twice;
4. isolates failures per document (logged, the rest continue; the transaction is already stored).

The card feed is authenticated like the webhooks (section 5.6, `TRANSACTIONS_WEBHOOK_SECRET`).

### 5.6 Webhook authentication (bonus B5)

Every inbound endpoint verifies an HMAC-SHA256 of the **raw request bytes** before anything else happens:

| Endpoint                      | Header                | Secret                        | Scheme                                                  |
| ----------------------------- | --------------------- | ----------------------------- | ------------------------------------------------------- |
| `POST /api/webhooks/whatsapp` | `X-Hub-Signature-256` | `WHATSAPP_APP_SECRET`         | Meta's: `sha256=<hex HMAC of the body, app secret key>` |
| `POST /api/webhooks/email`    | `X-Signature-256`     | `EMAIL_WEBHOOK_SECRET`        | Same format (assumption, D36)                           |
| `POST /api/transactions`      | `X-Signature-256`     | `TRANSACTIONS_WEBHOOK_SECRET` | Same format                                             |
| `GET /api/webhooks/whatsapp`  | —                     | `WHATSAPP_VERIFY_TOKEN`       | Meta's subscription handshake: echo `hub.challenge`     |

```mermaid
sequenceDiagram
    participant P as Provider
    participant H as Webhook handler
    participant V as SignatureVerifier
    participant I as Ingestion
    P->>H: POST raw body + signature header
    H->>V: verify(raw bytes, headers)
    alt missing or wrong signature
        V-->>H: MISSING_SIGNATURE / INVALID_SIGNATURE
        H-->>P: 401 (logged as webhook.unauthorized, body never parsed)
    else valid, or no secret configured
        V-->>H: ok
        H->>H: JSON.parse → Zod (400 if malformed)
        H->>I: receive(payload)
        H-->>P: 200 / 500 (section 5.3)
    end
```

- `SignatureVerifier` is an interface (Strategy). `HmacSha256SignatureVerifier` compares with `timingSafeEqual`, so
  response time does not reveal how much of a guessed signature was right. A provider with another scheme (Mailgun's
  timestamp + token, SendGrid's ECDSA) is one new class, chosen in `lib/webhooks/security/create-verifiers.ts`.
- **No secret configured → unsigned requests are accepted** and startup logs `webhook.signature_disabled` per
  endpoint. That keeps `npm run dev` and the demo working without setup; `npm run demo:webhooks` signs every request
  when the same secrets are exported.
- **Replays** of a correctly signed delivery are harmless: Meta's signature has no timestamp, but the idempotency keys
  (section 5.1) turn a replay into a `duplicate`.

## 6. Data model

### 6.1 Entities

```mermaid
erDiagram
  Client ||--o{ ClientSenderEmail : "registers"
  Client ||--o{ Driver : "employs"
  Client ||--o{ Card : "owns"
  Client ||--o{ Transaction : "has"
  Card ||--o{ Transaction : "charged on"
  Client |o--o{ Document : "scoped to"
  Document ||--o{ DocumentMatch : "candidates"
  Transaction ||--o{ DocumentMatch : "candidates"

  Client {
    int id PK
    string name
    string slug UK "inbox alias: receipts+slug@"
  }
  ClientSenderEmail {
    int id PK
    int clientId FK
    string email UK
  }
  Driver {
    int id PK
    int clientId FK
    string phone "E.164, unique per client"
  }
  Card {
    int id PK
    int clientId FK
    string last4 "not unique (E2)"
    string label
  }
  Transaction {
    int id PK
    int clientId FK
    int cardId FK
    string driverPhone "E.164, WhatsApp scope"
    string merchantName "acquirer string"
    string mcc
    int amount "halalas"
    string currency
    datetime transactionAt
  }
  Document {
    int id PK
    enum source
    string externalId UK
    string contentHash UK "nullable (D6)"
    string senderIdentifier
    string recipientIdentifier "email to (alias)"
    int clientId FK "nullable"
    enum status
    string failureReason
    string storageKey
    string mimeType
    enum documentType
    string merchantName
    string vatNumber
    string invoiceNumber
    int totalAmount
    string currency
    datetime documentDate
    string cardLast4
    string rawText
    float extractionConfidence
    json decisionReasons
    datetime receivedAt
  }
  DocumentMatch {
    int id PK
    int documentId FK
    int transactionId FK
    int rank
    float confidence
    json signals
    json flags
    enum status
    string decidedBy
    datetime decidedAt
    int confirmedTransactionId UK "set only when confirmed"
    int confirmedDocumentId UK "set only when confirmed"
  }
```

Changes from the spec's suggested schema, and why:

| Change                                                                                                                     | Why                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `Client`, `ClientSenderEmail`                                                                                              | Email scoping needs a sender → client mapping (E1); the spec schema has none               |
| `Driver` (client, phone)                                                                                                   | The brief asks for a driver-phone mapping; a phone may drive for more than one client      |
| `Document.recipientIdentifier`                                                                                             | Keeps the email `to` address so the client alias can be resolved when processing           |
| `Card` entity; `Transaction.cardLast4` → `cardId`                                                                          | Two cards can share a last4 (E2); a `Card` row makes that explicit instead of merging them |
| `Transaction.driverPhone` kept (not moved to `Card`)                                                                       | Fleet cards are often per vehicle and shared; the driver is a fact of the _transaction_    |
| `Transaction.mcc`                                                                                                          | Tip tolerance applies only to restaurants (D3)                                             |
| `Document.contentHash` nullable                                                                                            | A document whose media could not be fetched must still be saved as `FAILED` (D6)           |
| `Document.clientId`, `failureReason`, `decisionReasons`, `invoiceNumber`, `extractionConfidence`, `storageKey`, `mimeType` | Scope, explainability, audit, and letting a reviewer see the file (D10)                    |
| `DocumentMatch.rank`, `flags`, `confirmed*Id`                                                                              | Ordering, per-candidate warnings, and the one-confirmed rules (below)                      |
| `documentType` as an enum                                                                                                  | It is a closed set in the provided interface                                               |

### 6.2 Rules the database enforces

| Rule                                                                                       | Mechanism                                                                     |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| One `Document` per provider message                                                        | `UNIQUE(externalId)`                                                          |
| One `Document` per file content                                                            | `UNIQUE(contentHash)` (nullable: SQLite allows many `NULL`s)                  |
| A transaction appears once per document's candidate list                                   | `UNIQUE(documentId, transactionId)` (spec)                                    |
| **At most one confirmed document per transaction** (R25)                                   | `UNIQUE(confirmedTransactionId)` — set to `transactionId` only when confirmed |
| At most one confirmed transaction per document                                             | `UNIQUE(confirmedDocumentId)` — set to `documentId` only when confirmed       |
| `confirmed*Id` is set **if and only if** status is confirmed, and equals the row's own ids | `CHECK` constraints added to the migration SQL                                |
| A decided match records who decided and when                                               | `CHECK (status = 'CANDIDATE' OR (decidedBy, decidedAt NOT NULL))`             |
| A document without a content hash must be `FAILED`, and a `FAILED` document has a reason   | `CHECK` constraints on `Document`                                             |
| Confidence stays within [0, 1]; transaction amounts are positive                           | `CHECK` constraints                                                           |

**Why nullable unique columns instead of a partial unique index** (`… WHERE status IN ('CONFIRMED','AUTO_CONFIRMED')`):
SQLite supports partial indexes, but Prisma's schema cannot express them, so `prisma migrate` would treat a
hand-written one as drift. Nullable unique columns are first-class in Prisma and give the same guarantee. The `CHECK`
constraints, by contrast, are invisible to Prisma's differ: after adding them, `prisma migrate dev` still reports "in
sync". Every rule above is proven by `__tests__/integration/schema-constraints.test.ts`.

### 6.3 Document lifecycle

```mermaid
stateDiagram-v2
  [*] --> RECEIVED: intake inserted
  [*] --> FAILED: media unavailable at intake
  RECEIVED --> EXTRACTED: extraction ok
  RECEIVED --> FAILED: extraction error / invalid output
  EXTRACTED --> MATCHED: AUTO_MATCHED
  EXTRACTED --> NEEDS_REVIEW: NEEDS_REVIEW
  EXTRACTED --> UNMATCHED: UNMATCHED / unknown sender
  EXTRACTED --> FAILED: processing error
  NEEDS_REVIEW --> MATCHED: reviewer confirms
  NEEDS_REVIEW --> UNMATCHED: last candidate rejected
  UNMATCHED --> MATCHED: re-match (bonus B2)
  UNMATCHED --> NEEDS_REVIEW: re-match (bonus B2)
  MATCHED --> [*]
  FAILED --> [*]
```

Every transition goes through `DocumentStateMachine`, which rejects anything not drawn here and writes with a
conditional update (`WHERE id = ? AND status = <expected from>`), so two concurrent workers cannot both advance a
document.

### 6.4 Match lifecycle

```mermaid
stateDiagram-v2
  [*] --> AUTO_CONFIRMED: matcher, top candidate
  [*] --> REJECTED: matcher, runners-up of an auto-match
  [*] --> CANDIDATE: matcher, needs review
  CANDIDATE --> CONFIRMED: reviewer confirms
  CANDIDATE --> REJECTED: reviewer rejects / sibling confirmed
  AUTO_CONFIRMED --> [*]
  CONFIRMED --> [*]
  REJECTED --> [*]
```

Undoing an `AUTO_CONFIRMED` match is out of scope (not asked for; listed under more time).

---

## 7. Review actions

`confirmMatch` and `rejectMatch` (`lib/actions/review.ts`) are thin next-safe-action wrappers over `ReviewService`.
They use `.inputSchema()` — the spec's `.schema()` is a deprecated alias in next-safe-action v8.

| Call                                                      | Result                                                                                                    |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Confirm a `CANDIDATE`                                     | Match `CONFIRMED`, siblings `REJECTED`, document `MATCHED` — one transaction                              |
| Confirm the **same** match again (double-submit)          | No-op success (`alreadyConfirmed`)                                                                        |
| Confirm a sibling after one was confirmed                 | Error `MATCH_NOT_PENDING`                                                                                 |
| Confirm when the transaction already has a document (S07) | Error `TRANSACTION_ALREADY_HAS_DOCUMENT` — raised by `UNIQUE(confirmedTransactionId)`, not by a pre-check |
| Confirm a `REJECTED` match                                | Error `MATCH_NOT_PENDING`                                                                                 |
| Reject a `CANDIDATE`, others remain                       | Match `REJECTED`, document stays `NEEDS_REVIEW`                                                           |
| Reject the last remaining `CANDIDATE`                     | Match `REJECTED`, document `UNMATCHED`                                                                    |
| Reject the same match again                               | No-op success (`alreadyRejected`)                                                                         |
| Unknown `matchId` / invalid input                         | `MATCH_NOT_FOUND` / validation error                                                                      |

Double-submit safety comes from conditional updates (`UPDATE … WHERE id = ? AND status = 'CANDIDATE'`) inside one
database transaction, not from UI state. If that guarded update loses a race, the service re-reads the match: losing
to an _identical_ decision (a double-click) is reported as `alreadyConfirmed` / `alreadyRejected`; losing to anything
else is `MATCH_NOT_PENDING`. A confirmation that would give a transaction a second document fails on
`UNIQUE(confirmedTransactionId)` and is reported as `TRANSACTION_ALREADY_HAS_DOCUMENT`
(`DOCUMENT_ALREADY_MATCHED` for the mirror case). Expected outcomes are returned as values (`{ ok: false, code }`),
so the UI can show each one; only unexpected failures surface as server errors. Reviewer identity is a placeholder
(`reviewer:demo`) because authentication is out of scope.

---

### 7.1 Review queue UI (bonus B1)

`/review` is designed for **decisions per minute without losing precision**:

- **Two panes, evidence beside the decision:** the queue (oldest first, reason badges, amount) on the left; the
  document (extracted facts + the original photo or PDF) next to its ranked candidates on wide screens, so the reviewer
  never scrolls to act. Phones get list → detail with full-width touch targets and native page scrolling.
- **Differences in words, not numbers:** each candidate shows amount, date and card _relative to the document_
  ("Exact", "+SAR 5.75 (10%) · tip?", "Charged 1 day later", "Receipt 4477 vs 4471 · misread?"), plus the per-signal
  scores for explainability.
- **Keyboard-first:** `J/K`, `1–5`, `Enter`/`C`, `X`; after a confirm (or the last reject) the next document opens.
- **Precision built into the UX:** for look-alike candidates (`NEAR_TIE`) nothing is pre-selected, so `Enter` cannot
  confirm a coin flip; conflicts from the database (e.g. a transaction that already has a document) are explained in
  plain language and nothing changes.
- **Fast by construction:** server components render all data; only the candidate board (decisions, keyboard) and
  tooltips run on the client. The read side (`ReviewQueueReader`) is separate from the write side (`ReviewService`).
- **Verified in a real browser** at 1440, 1280, 820 and 390 px, light and dark: layout, the keyboard flow (pick →
  confirm → auto-advance) and the database-conflict message. UI logic (comparisons, reason copy, navigation, view
  models) is unit-tested; React components are covered by that browser check rather than a component-test framework,
  in line with the lean test strategy.

## 8. Decision log

Each decision lists what was chosen, what was rejected, and why.

### Confirmed with the examiner ("take your defaults")

| ID  | Decision                                                                            | Rejected alternative                  | Why                                                                                          |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------- |
| E1  | Email scope: `to` alias `receipts+<slug>@` → registered `from` → `UNKNOWN_SENDER`   | `from` only                           | The spec's own example `from` is a supplier who serves many clients; an alias is unambiguous |
| E2  | Card last4 is not unique per client                                                 | Treat last4 as an identifier          | 10,000 values; ~40 % collision chance in a 100-card fleet                                    |
| E3  | Strictly one confirmed document per transaction; a later tax invoice goes to review | Let the invoice supersede the receipt | Spec rule as written; supersede listed under more time                                       |
| E4  | Transaction amounts are final settled values; refunds out of scope                  | Model pre-authorizations              | Exact-amount matching is meaningless against a pre-auth hold                                 |

### Design decisions

| ID  | Decision                                                                                   | Rejected alternative                             | Why                                                                                                               |
| --- | ------------------------------------------------------------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| D1  | Precision over recall                                                                      | Maximize auto-match rate                         | Section 2: a wrong attach is silent and costly; a review is cheap                                                 |
| D2  | Filters → weighted score → gates, with reason codes                                        | Plain weighted sum; Fellegi–Sunter               | Section 3.8                                                                                                       |
| D3  | `mcc` on transactions; tip band only for MCC 5812/5814; tips never auto                    | Global ±20 % tolerance                           | A fuel station charging 20 % over its receipt would look plausible                                                |
| D4  | Card last4 graded: equal / one-digit misread / filtered / absent                           | Hard veto on any mismatch                        | Thermal-paper OCR confuses `1`/`7`, `0`/`8`; a random different card differs in one digit only 0.4 % of the time  |
| D5  | `Card` entity (`clientId`, `last4`, `label`); `driverPhone` stays on `Transaction`         | Flat `cardLast4` string; `driverPhone` on `Card` | Makes shared last4 explicit; drivers share vehicle cards, so the driver belongs to the transaction                |
| D6  | `contentHash` nullable                                                                     | Required hash                                    | A failed media fetch would otherwise lose the webhook                                                             |
| D7  | Malformed envelope → 400; a bad message inside a valid envelope is skipped, 200            | 400 for the whole batch                          | Meta retries the whole delivery on non-2xx — one bad message would loop forever                                   |
| D8  | Runners-up of an auto-match stored as `REJECTED` by `system`                               | Discard them                                     | Audit trail, and future training data                                                                             |
| D9  | Same confirm twice = no-op; confirming a sibling or rejected match = error                 | Error on every repeat                            | Double-clicks are normal; conflicting decisions are not                                                           |
| D10 | `storageKey` + `mimeType` on `Document`                                                    | Store bytes in the database                      | A reviewer must see the file; blobs belong in object storage                                                      |
| D11 | Scope filtered in the query **and** re-checked in the matcher (`signals.scope`)            | Query only                                       | Defence in depth; the spec lists scoping as a signal                                                              |
| D12 | Unmeasurable signals omitted from `signals`; `reasons`/`flags` added                       | `null` values                                    | Keeps the spec's `Record<string, number>` type                                                                    |
| D13 | Persist → respond → `after()` for extraction + matching                                    | Synchronous processing; a queue                  | Fast responses without infrastructure; a queue is the production path (risk register)                             |
| D14 | Extractor/media failures → `FAILED`; extracted-but-unusable → `UNMATCHED` + reason         | Everything `FAILED`                              | `FAILED` means "system problem, retry"; `UNMATCHED` means "a human should look"                                   |
| D15 | Ingestion tests on a real SQLite test database                                             | Mocked Prisma                                    | Idempotency is a unique-constraint property; only a real database proves it                                       |
| D16 | No status-history table                                                                    | `DocumentEvent` audit table                      | Final state + `decidedBy`/`decidedAt`/`failureReason` answer who/when/why; history under more time                |
| D17 | WhatsApp media fetched and hashed **during** the request (3 s timeout)                     | Fetch in the background                          | Content dedupe must happen before the row exists; otherwise duplicates need a merge state                         |
| D18 | Amount plausibility is a **filter** (directional, MCC-aware)                               | Amount as a score only                           | Stops strong merchant/date/card from dragging a different purchase into review                                    |
| D19 | `MatchResult.excluded` counts per filter                                                   | Only return survivors                            | Explains _why_ nothing matched ("4 removed by currency")                                                          |
| D20 | Generic category words weigh 0.3 in merchant similarity                                    | All tokens equal                                 | `rawabi fuel` vs `alfanar fuel` must not score 0.5 just for sharing `fuel`                                        |
| D21 | Store numbers dropped during normalization                                                 | Keep them                                        | Section 4 trade-off: avoids confident wrong matches from misread station numbers                                  |
| D22 | `Driver` table for phone → client(s)                                                       | Derive clients from `Transaction.driverPhone`    | Explicit mapping the brief asks for; a new driver is known before their first transaction                         |
| D23 | Each test file gets its own migrated SQLite copy                                           | One shared test database                         | Parallel Jest workers never interfere; tests run against the real schema and `CHECK`s                             |
| D24 | Bytes go to a `BlobStore` keyed by content hash before the insert                          | Keep bytes in memory for `after()`               | Processing, reprocessing and the reviewer all read the same stored file; a crash loses no bytes                   |
| D25 | `BackgroundScheduler` interface (`after()` in production, inline in tests)                 | Call `after()` directly                          | Services stay framework-free; tests await post-response work deterministically                                    |
| D26 | A redelivery is reported as an `externalId` duplicate even though it also repeats the hash | Report whichever constraint SQLite names first   | The result must say _why_ it was a duplicate: same message vs same file in a new message                          |
| D27 | An auto-match that loses the confirmed-slot race is re-saved as `NEEDS_REVIEW`             | Fail the document                                | The database stops the double confirmation; the document still reaches a human                                    |
| D28 | Review outcomes are values; a lost race re-reads the match                                 | Throw on every non-update                        | A double-click must succeed quietly, while a genuine conflict must be shown to the reviewer                       |
| D29 | One `MatchStage` shared by first-time processing and re-matching                           | A separate re-match matcher                      | Both paths must follow identical rules; one implementation cannot drift                                           |
| D30 | `Transaction.externalRef` unique, added by an additive migration                           | Trust the feed not to redeliver                  | Same idempotency principle as the webhooks; additive `ALTER TABLE` keeps the hand-written `CHECK`s intact         |
| D31 | Re-matching excludes transactions already proposed for the document                        | Re-propose everything                            | A reviewer's rejection is a decision; asking again wastes their time and invites a wrong confirm                  |
| D32 | Look-alike candidates are not pre-selected in the UI                                       | Pre-select the top candidate everywhere          | A one-key default on a coin flip invites exactly the silent wrong match section 2 forbids                         |
| D33 | Server components + two small client islands (candidate board, tooltips)                   | A client-side SPA fetching JSON                  | Less JavaScript, no loading waterfalls, data rendered where the database is                                       |
| D34 | Separate read model (`ReviewQueueReader`) from decisions (`ReviewService`)                 | One service for both                             | Queries can be shaped for the screen without touching the invariant-enforcing write path                          |
| D35 | Verify the HMAC over the raw bytes, before JSON parsing                                    | Verify after parsing / on re-serialized JSON     | Re-serialized JSON changes bytes and breaks valid signatures; unauthenticated input should never reach a parser   |
| D36 | Email and card feed use Meta's `sha256=` HMAC format under `X-Signature-256`               | Pick one email provider's scheme now             | The brief names no email provider; one well-known format behind an interface is swapped per provider in one class |
| D37 | An endpoint without a secret accepts unsigned requests and logs a warning at startup       | Refuse every request until secrets are set       | Clone-and-run must keep working for reviewers; the warning makes the open door visible (risk register)            |
| D38 | Review UI prefetches the next/previous document and caches visited ones for 30 s           | Client-side SPA fetching JSON per document       | Instant J/K with the existing server components; decisions still refresh, and guarded writes catch stale views    |

---

## 9. Assumptions

- Reviewers are trusted internal users; authentication and authorization are out of scope (`reviewer:demo`).
- All transactions are SAR; documents in another currency never match (S13).
- Transactions arrive through an existing feed; this project seeds them (an ingestion entry point is bonus B2).
- Riyadh has no daylight saving time, so "Riyadh day" is a fixed UTC+3 offset.
- Provider timestamps (`receivedAt`, WhatsApp `timestamp`) are not used for matching. The spec's WhatsApp example
  timestamp `1718356881` is 2024-06-14 while its email example is 2025-06-14; we use the document's printed date.
- Attachments other than PDF/JPEG/PNG/WebP/HEIC are ignored. **Images** smaller than 8 KB or named like
  `logo`/`signature`/`banner`/`icon` are treated as email signature art and ignored; **PDFs are always documents**
  (a text-only invoice PDF can legitimately be a few KB).
- Document bytes are written to a `BlobStore` under their content hash (`storageKey`); locally that is `.storage/`
  (`LocalFileBlobStore`), in production an object store behind the same interface.
- Four fixtures (01, 03, 09, 12) are real phone photos of printed-style generated receipts (`fixtures/print/`),
  sanitized (EXIF/GPS stripped); the rest are generated documents (`fixtures/ATTRIBUTION.md`).

---

## 10. Requirement traceability

Testing approach: one test per business rule at the cheapest layer that proves it — pure rules as unit tests,
database guarantees as integration tests, and each scenario once end-to-end through the real webhook handlers. The
rule-by-rule map is [`docs/TEST-INVENTORY.md`](docs/TEST-INVENTORY.md); `npm run test:mix` reports the layer balance.

Every requirement in the brief, the milestone that delivers it, and the test or check that proves it. The
"Verified by" column is filled in as each milestone closes.

| ID  | Requirement                                                                  | Milestone  | Verified by                                                                                                                                             |
| --- | ---------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `POST /api/webhooks/email`                                                   | M4         | `__tests__/e2e/webhooks.e2e.test.ts` (email scenarios)                                                                                                  |
| R2  | `POST /api/webhooks/whatsapp`                                                | M4         | `__tests__/e2e/webhooks.e2e.test.ts` (WhatsApp scenarios)                                                                                               |
| R3  | `MediaStore` interface backed by a fixture map                               | M3         | `__tests__/unit/media/fixture-media-store.test.ts`, `fixtures-consistency.test.ts`                                                                      |
| R4  | Zod validation; malformed → 400 with a useful body                           | M4         | `__tests__/e2e/webhooks.e2e.test.ts` I01/I02/invalid JSON; `unit/webhooks/*-adapter.test.ts`                                                            |
| R5  | Same message id → no duplicate document                                      | M4         | `__tests__/e2e/webhooks.e2e.test.ts` S04 redelivery, I09 concurrency                                                                                    |
| R6  | Same file content → no duplicate document                                    | M4         | `__tests__/e2e/webhooks.e2e.test.ts` S04 resend                                                                                                         |
| R7  | Fast response; never 500 on extraction/matching failure                      | M4         | `__tests__/e2e/webhooks.e2e.test.ts` S10, I05, I10; `integration/ingestion/document-processor.test.ts`                                                  |
| R8  | Sender phone/email scope matchable transactions                              | M1, M2, M4 | matcher `filters.test.ts`; `unit/ingestion/sender-resolver.test.ts`; `__tests__/e2e/webhooks.e2e.test.ts` (S01 scoping, S11)                            |
| R9  | `ExtractedDocument` / `DocumentExtractor` interfaces                         | setup      | `lib/extraction/types.ts` (verbatim)                                                                                                                    |
| R10 | `MockExtractor` keyed by file hash                                           | M3         | `__tests__/unit/extraction/mock-extractor.test.ts`, `fixture-registry.test.ts`                                                                          |
| R11 | ≥ 6 committed fixture documents                                              | M3         | 12 documents in `fixtures/scenarios/`; `fixtures-consistency.test.ts`                                                                                   |
| R12 | Pipeline coded against the extractor interface                               | M3, M4     | `DocumentExtractor` injected via `lib/container.ts`; `document-processor.test.ts` (stub extractors)                                                     |
| R13 | Prisma schema                                                                | M2         | `prisma/schema.prisma` + init migration; `__tests__/integration/schema-constraints.test.ts`                                                             |
| R14 | Seed: ~15 transactions, 2 clients, sender mapping                            | M2         | `__tests__/integration/seed.test.ts` (counts, SD1, idempotent, rollback)                                                                                |
| R15 | Pure `matchDocument`, spec result shapes                                     | M1         | `__tests__/unit/matching/matcher.test.ts`, `scenarios.test.ts`                                                                                          |
| R16 | Amount, date, merchant, card, scope signals                                  | M1         | `signals.test.ts`, `filters.test.ts`, `amount-and-card-rules.test.ts`                                                                                   |
| R17 | Weights and thresholds documented and justified                              | M0, M1     | this file §3 + `matching-config.ts`                                                                                                                     |
| R18 | High single candidate → `AUTO_MATCHED`, `AUTO_CONFIRMED`, document `MATCHED` | M1, M4     | `__tests__/e2e/webhooks.e2e.test.ts` scenario table                                                                                                     |
| R19 | Mid confidence or near tie → `NEEDS_REVIEW`, ranked candidates persisted     | M1, M4     | `__tests__/e2e/webhooks.e2e.test.ts` scenario table                                                                                                     |
| R20 | Nothing plausible → `UNMATCHED`                                              | M1, M4     | `__tests__/e2e/webhooks.e2e.test.ts` scenario table                                                                                                     |
| R21 | Transaction with a confirmed document never auto-matches a second            | M1, M4     | `__tests__/e2e/webhooks.e2e.test.ts` scenario table                                                                                                     |
| R22 | Edge cases 1–6 in fixtures and tests                                         | M1, M3, M4 | `__tests__/e2e/webhooks.e2e.test.ts` S01–S13; `fixtures-consistency.test.ts`                                                                            |
| R23 | `confirmMatch` semantics                                                     | M5         | `__tests__/e2e/review.e2e.test.ts` › confirmMatch                                                                                                       |
| R24 | `rejectMatch` semantics                                                      | M5         | `__tests__/e2e/review.e2e.test.ts` › rejectMatch                                                                                                        |
| R25 | Double-submit safe; one confirmed document per transaction in the data layer | M2, M5     | `__tests__/e2e/review.e2e.test.ts` (double-submit, concurrent rivals, S07 DB refusal); `schema-constraints.test.ts`; `unit/review/review-races.test.ts` |
| R26 | Matcher unit tests for every edge case                                       | M1         | `scenarios.test.ts` (S01–S13), `unit-scenarios.test.ts` (U01–U12), `invariants.test.ts`                                                                 |
| R27 | Ingestion tests: once, redelivery, extraction failure                        | M4         | `__tests__/e2e/webhooks.e2e.test.ts` (S04, I09, S10); `document-processor.test.ts`                                                                      |
| R28 | Normalization/similarity tests on messy merchant strings                     | M1         | `__tests__/unit/matching/text/*.test.ts`                                                                                                                |
| R29 | TypeScript strict, Zod at boundaries, no `any`                               | all        | `tsconfig.json` strict; ESLint `no-explicit-any: error`                                                                                                 |
| R30 | README: setup, run, seed, fire webhooks, run tests                           | M6         | `README.md` (quick start, `npm run demo:webhooks`, `requests.http`, `npm run db:report`, tests)                                                         |
| R31 | `IMPLEMENTATION.md`: approach, decisions, assumptions, more time, trade-offs | M0 → M6    | this file                                                                                                                                               |
| R32 | GitHub repository shared                                                     | M6         | https://github.com/gitAbid/darb-takehome                                                                                                                |
| R33 | Spec project structure and boilerplate                                       | setup      | files byte-identical to the brief                                                                                                                       |
| B1  | Bonus: `/review` page                                                        | M9         | `app/review`; `unit/review-ui/*`, `integration/review-read-model.test.ts`; browser-verified (§7.1)                                                      |
| B2  | Bonus: re-match `UNMATCHED` documents when transactions arrive               | M8         | `e2e/rematch.e2e.test.ts`; `integration/ingestion/rematch-isolation.test.ts` (§5.5)                                                                     |
| B3  | Bonus: multi-transaction invoice design sketch                               | M7         | design in §12 (not built)                                                                                                                               |
| B4  | Bonus: real extractor behind the interface, mock by default                  | M11        | not built (optional M11)                                                                                                                                |
| B5  | Bonus: HMAC signature verification                                           | M10        | `unit/webhooks/signature-verification.test.ts`; `e2e/webhooks.e2e.test.ts` › "webhook authentication (bonus B5)" (section 5.6)                          |

---

## 11. Risk register

| Risk                                                             | Impact                                        | Mitigation now                                                              | Production answer                              |
| ---------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------- |
| `after()` work is lost if the process crashes                    | Document stuck in `RECEIVED`                  | State is visible; a `reprocess(documentId)` entry point is cheap to add     | Durable queue (SQS / BullMQ) with retries      |
| Hand-tuned weights and thresholds                                | Wrong auto-matches or too many reviews        | Conservative gates; every decision stores its `signals`                     | Calibrate on reviewer decisions (section 3.8)  |
| `CHECK` constraints live only in migration SQL                   | A future SQLite table rebuild could drop them | Unique columns already enforce the core rule; tests assert the checks exist | Postgres partial unique index + `CHECK`        |
| Async logging drops the last lines on a hard crash               | Missing log lines                             | Audit facts live in the database, not the logs                              | Ship logs to a collector; stdout on containers |
| A transient media/extraction failure becomes a terminal `FAILED` | Document needs manual handling                | `FAILED` is queryable with a reason                                         | Retry policy in the queue                      |
| Re-photographed duplicates have different bytes                  | Second document for the same purchase         | `TXN_ALREADY_HAS_DOCUMENT` gate sends it to review                          | Perceptual hashing                             |
| SQLite allows a single writer                                    | Throughput ceiling                            | Fine for the exercise                                                       | Postgres                                       |
| Webhook secrets left unset in production                         | Anyone can post documents or transactions     | `webhook.signature_disabled` warning at startup per endpoint (D37)          | Fail startup in production without secrets     |

---

## 12. Multi-transaction invoices (design sketch)

_Bonus B3 — designed, not built._ Suppliers often send **one tax invoice or monthly statement covering many card
transactions** ("Alfanar Fuel — June statement, 14 fills"). Today such a document would either match nothing (its
total equals no single transaction) or, worse, match one transaction whose amount happens to equal the total. This
section shows how to support it without weakening the precision-first stance.

### 12.1 What changes in the extraction contract

The provided `ExtractedDocument` gains one **optional** field, so existing extractors keep working unchanged:

```ts
interface ExtractedLine {
  lineNumber: number;
  date: string | null; // ISO 8601
  amount: number | null; // halalas, VAT-inclusive
  cardLast4: string | null;
  reference: string | null; // pump/receipt number when printed
}

interface ExtractedDocument {
  // …existing fields; totalAmount stays the statement total
  lineItems?: ExtractedLine[]; // present only for statements / multi-line invoices
}
```

A document is treated as **multi-transaction** when it has two or more line items. A single line item is handled
exactly like today's single-transaction document.

### 12.2 Data model

```mermaid
erDiagram
  Document ||--o{ DocumentLine : "has lines"
  DocumentLine ||--o{ DocumentMatch : "candidates per line"
  Transaction ||--o{ DocumentMatch : "candidates"
  DocumentLine {
    int id PK
    int documentId FK
    int lineNumber
    datetime date
    int amount
    string cardLast4
    string reference
  }
  DocumentMatch {
    int documentLineId FK "nullable: null = whole-document match"
    int confirmedTransactionId UK "unchanged: one confirmed document per transaction"
    int confirmedLineId UK "replaces confirmedDocumentId for multi-line documents"
  }
```

| Change                                                    | Why                                                                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| New `DocumentLine` table                                  | Each line is matched, reviewed and audited on its own                                                |
| `DocumentMatch.documentLineId` (nullable)                 | Candidates belong to a line; `null` keeps today's single-transaction rows valid                      |
| `UNIQUE(confirmedTransactionId)` **kept**                 | A transaction still has at most one confirmed document — even when that document is a statement (E3) |
| `UNIQUE(confirmedDocumentId)` → `UNIQUE(confirmedLineId)` | A statement legitimately confirms many transactions, but each **line** confirms at most one          |
| New document status `PARTIALLY_MATCHED`                   | Some lines confirmed, others still in review — visible in the queue instead of hidden                |

### 12.3 Matching

```mermaid
flowchart TD
  S["Statement: header (merchant, VAT number, total) + lines"] --> C{"Σ line amounts = total<br/>(± rounding)?"}
  C -- no --> R1["NEEDS_REVIEW · STATEMENT_TOTAL_MISMATCH<br/>(OCR missed or misread a line)"]
  C -- yes --> L["For each line: today's matcher<br/>line date/amount/card + header merchant"]
  L --> A["One-to-one assignment across lines<br/>(no transaction used by two lines)"]
  A --> G{"Per line: gates pass AND<br/>its winner is uncontested?"}
  G -- yes --> AM["Line auto-confirmed"]
  G -- no --> NR["Line → review with ranked candidates"]
  AM & NR --> D["Document: MATCHED if every line confirmed,<br/>else PARTIALLY_MATCHED / NEEDS_REVIEW"]
```

1. **Total check first.** If the lines do not add up to the printed total, OCR missed or misread something; nothing
   is auto-matched (`STATEMENT_TOTAL_MISMATCH`).
2. **Reuse the matcher per line.** Each line becomes an `ExtractedFields` (line date, amount and card; header
   merchant, currency and sender scope) and runs through the existing filters, signals and gates — no second scoring
   model to maintain.
3. **One-to-one assignment.** Lines compete for transactions: two lines of SAR 100.00 on consecutive days could both
   prefer the same refuel. The candidate scores form a small cost matrix; the **Hungarian algorithm** (statements
   rarely exceed a few dozen lines) finds the assignment with the highest total score. Greedy best-first is simpler
   but can lock in a bad early choice.
4. **Contention gate** (new reason `LINE_CONTESTED`). A line is auto-confirmed only if its assigned transaction is not
   also a near-equal candidate for another line, and the next-best assignment scores clearly lower. Otherwise it goes
   to review — swapping two near-identical fills is exactly the silent error section 2 forbids.
5. **Per-line outcomes.** Uncontested lines that pass every gate auto-confirm; the rest wait for a reviewer, who
   confirms line by line with the existing actions (`matchId` already identifies the line's candidate). If the total
   check failed, no line auto-confirms.

### 12.4 When OCR finds only a total

Some statements list fills the OCR cannot read, leaving only the total. The fallback is **subset-sum**: find sets of
in-scope transactions in the statement period whose amounts add up to the total.

- It is exponential in general; with a 30–45-day period, one client's scope and a cap of ~25 candidates,
  meet-in-the-middle keeps it fast.
- Fleets buy round amounts (SAR 100, 150, 200) repeatedly, so **several different subsets often fit**. The result is
  therefore **never auto-matched**: the reviewer sees the fitting subsets ranked by date spread and merchant
  similarity, with `TOTAL_ONLY_STATEMENT`.

### 12.5 Ingestion, review and tests

- **Ingestion:** unchanged — one email attachment is still one `Document`; the processor writes `DocumentLine` rows
  next to the extraction snapshot, in the same unit of work as the matches.
- **Review:** the queue groups a statement's lines under its header; confirming one line's candidate rejects that
  line's siblings only. The document becomes `MATCHED` when the last line is decided.
- **Tests to add:** one end-to-end row each for (a) a three-line statement where every line matches uniquely →
  `MATCHED`; (b) two identical SAR 100.00 lines on consecutive days → both `LINE_CONTESTED` in review; (c) lines that
  do not add up → `STATEMENT_TOTAL_MISMATCH`; (d) a total-only statement → `TOTAL_ONLY_STATEMENT` with subsets. Unit
  tests for the assignment (optimal vs greedy counter-example) and the contention gate.

**Rejected alternatives:** matching the statement total against single transactions (wrong by construction); splitting
a statement into one `Document` per line at intake (loses the shared header, the total check and the single audit
trail of what the supplier actually sent).

---

## 13. With more time

- **Calibrated scoring:** fit weights and thresholds on reviewer decisions; report precision/recall per threshold.
- **Supersede rule (E3):** let a tax invoice replace a confirmed receipt with an explicit reviewer action.
- **Undo** for `AUTO_CONFIRMED` matches, with an audit entry.
- **Status history** (`DocumentEvent`) written by the state machine (D16).
- **Merchant master data** keyed by VAT number, and Arabic ↔ Latin transliteration for merchant names.
- **Durable queue and `reprocess` endpoint** for `RECEIVED`/`FAILED` documents.
- **Perceptual hashing** to catch re-photographed duplicates before matching.
- **Pre-authorization and refund** handling (E4).
- **Foreign-currency** receipts matched via the settlement FX rate.
