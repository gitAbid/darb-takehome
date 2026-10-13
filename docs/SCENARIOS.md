# Scenario Matrix

This file is the **single source of truth** for test data. The seed (`prisma/seed-data/`), the fixture folders
(`fixtures/scenarios/<id>/`), the generated webhook payloads and the matcher/ingestion tests are all derived from it.
A consistency test (M3.6) fails if they drift apart.

- All amounts are **halalas** (SAR × 100). All dates are June 2025.
- Times are stored in UTC; the **Riyadh day** (UTC+3) is what the matcher compares.
- Scores use the weights and curves defined in [`IMPLEMENTATION.md` § Matching engine](../IMPLEMENTATION.md#3-matching-engine).

---

## 1. Seed data

### Clients and email senders

| Client | Name              | Inbox alias (`to`)                 | Registered sender (`from`)       |
| ------ | ----------------- | ---------------------------------- | -------------------------------- |
| C1     | Najd Logistics    | `receipts+najd@darb.example.com`   | `fleet@najd-logistics.example`   |
| C2     | Red Sea Transport | `receipts+redsea@darb.example.com` | `fleet@redsea-transport.example` |

### Drivers (WhatsApp senders)

| Driver | Phone (E.164)   | Client | Note                                 |
| ------ | --------------- | ------ | ------------------------------------ |
| D1     | `+966551234567` | C1     | The phone used in the spec's example |
| D2     | `+966552223344` | C1     |                                      |
| D3     | `+966553334455` | C2     |                                      |
| D4     | `+966554445566` | C1     |                                      |

### Cards

| Card | Client | Last4  | Why it exists                                                    |
| ---- | ------ | ------ | ---------------------------------------------------------------- |
| K1   | C1     | `4471` |                                                                  |
| K2   | C1     | `4471` | **Same last4 as K1 inside one client** (E2: last4 is not unique) |
| K3   | C1     | `8820` |                                                                  |
| K4   | C2     | `4471` | Same last4 in **another** client (scoping must keep them apart)  |
| K5   | C2     | `3051` |                                                                  |

### Transactions (15)

| Txn | Client | Card      | Driver | Merchant (acquirer string) | MCC  | Amount | `transactionAt` (UTC) | Riyadh day | Role                              |
| --- | ------ | --------- | ------ | -------------------------- | ---- | -----: | --------------------- | ---------- | --------------------------------- |
| T01 | C1     | K1 `4471` | D1     | `ALFANAR FUEL ST 04 RUH`   | 5541 |  15000 | 2025-06-10 07:42      | 06-10      | S01 winner                        |
| T02 | C2     | K4 `4471` | D3     | `ALFANAR FUEL ST 04 RUH`   | 5541 |  15000 | 2025-06-10 08:05      | 06-10      | Scoping distractor for S01        |
| T03 | C1     | K1 `4471` | D1     | `ALFANAR FUEL ST 04 RUH`   | 5541 |  15000 | 2025-06-13 06:30      | 06-13      | Repeat refuel 3 days later (S01)  |
| T04 | C1     | K3 `8820` | D4     | `ALFANAR FUEL ST 04 RUH`   | 5541 |  20000 | 2025-06-13 22:30      | **06-14**  | S02 tie (UTC day differs!)        |
| T05 | C1     | K2 `4471` | D2     | `ALFANAR FUEL ST 11 RUH`   | 5541 |  20000 | 2025-06-14 11:30      | 06-14      | S02 tie                           |
| T06 | C1     | K2 `4471` | D2     | `AL MASHWAR GRILL JED`     | 5812 |   6325 | 2025-06-12 17:40      | 06-12      | S03 restaurant with tip           |
| T07 | C1     | K3 `8820` | D4     | `RAWABI FUEL 07 DMM`       | 5541 |   9500 | 2025-06-11 06:00      | 06-11      | S07 — already has a confirmed doc |
| T08 | C1     | K1 `4471` | D1     | `LAMAA CAR WASH RUH`       | 7542 |   4500 | 2025-06-16 09:00      | 06-16      | S08 shared-last4 tie              |
| T09 | C1     | K2 `4471` | D2     | `LAMAA CAR WASH RUH`       | 7542 |   4500 | 2025-06-16 12:20      | 06-16      | S08 shared-last4 tie              |
| T10 | C1     | K1 `4471` | D1     | `RAWABI FUEL 03 RUH`       | 5541 |  12000 | 2025-06-18 15:10      | 06-18      | S09 card misread                  |
| T11 | C1     | K1 `4471` | D1     | `ALFANAR FUEL ST 04 RUH`   | 5541 |  10000 | 2025-06-16 06:00      | 06-16      | S12 back-to-back refuel (day 1)   |
| T12 | C1     | K1 `4471` | D1     | `ALFANAR FUEL ST 04 RUH`   | 5541 |  10000 | 2025-06-17 06:10      | 06-17      | S12 back-to-back refuel (day 2)   |
| T13 | C2     | K5 `3051` | D3     | `EMIRATES ROAD FUEL DXB`   | 5541 |  15300 | 2025-06-19 10:00      | 06-19      | S13 billed in SAR, receipt in AED |
| T14 | C2     | K4 `4471` | D3     | `AL MASHWAR GRILL JED`     | 5812 |   5750 | 2025-06-12 18:00      | 06-12      | Scoping distractor for S03        |
| T15 | C2     | K5 `3051` | D3     | `LAMAA CAR WASH RUH`       | 7542 |   4500 | 2025-06-16 10:00      | 06-16      | Scoping distractor for S08        |

All transactions are `SAR`. T14 is the most dangerous distractor: it has the **exact** receipt amount of S03 at the
same restaurant — if scoping were broken, it would beat the real (tipped) transaction.

### Pre-existing document

| Doc | Source   | Sender | Extracted                                | Status    | Match                                                        |
| --- | -------- | ------ | ---------------------------------------- | --------- | ------------------------------------------------------------ |
| SD1 | WHATSAPP | D4     | Rawabi Fuel, 9500, 2025-06-11, card 8820 | `MATCHED` | → T07 `CONFIRMED` by `reviewer:seed` at 2025-06-11 12:00 UTC |

---

## 2. Fixture documents (12 files — 8 generated, 4 photographed ≈ 67/33)

`kind`: **GEN** = rendered by script; **PHOTO** = generated receipt, printed and photographed on a phone, EXIF stripped.

| Fixture | Kind  | Type        | Merchant (as extracted)                                          | VAT number      | Amount | Cur | Doc date   | Last4  | Invoice #     | OCR conf |
| ------- | ----- | ----------- | ---------------------------------------------------------------- | --------------- | -----: | --- | ---------- | ------ | ------------- | -------: |
| F01     | PHOTO | RECEIPT     | Alfanar Fuel Station 04                                          | 300123456700003 |  15000 | SAR | 2025-06-10 | 4471   | —             |     0.95 |
| F02     | GEN   | TAX_INVOICE | Alfanar Fuel Company                                             | 300123456700003 |  20000 | SAR | 2025-06-14 | —      | INV-99830     |     0.92 |
| F03     | PHOTO | RECEIPT     | Al Mashwar Grill                                                 | 310987654300003 |   5750 | SAR | 2025-06-12 | 4471   | —             |     0.90 |
| F05     | GEN   | TAX_INVOICE | Sahara Auto Service                                              | 302468013500003 |  34000 | SAR | 2025-06-15 | —      | INV-2025-0612 |     0.93 |
| F06     | GEN   | UNKNOWN     | —                                                                | —               |      — | —   | —          | —      | —             |     0.12 |
| F07     | GEN   | TAX_INVOICE | Rawabi Fuel Company                                              | 305551112200003 |   9500 | SAR | 2025-06-11 | —      | INV-55120     |     0.94 |
| F08     | GEN   | RECEIPT     | Lamaa Car Wash                                                   | —               |   4500 | SAR | 2025-06-16 | 4471   | —             |     0.91 |
| F09     | PHOTO | RECEIPT     | Rawabi Fuel 03                                                   | 305551112200003 |  12000 | SAR | 2025-06-18 | `4477` | —             |     0.86 |
| F10     | GEN   | — (error)   | `{ kind: "error", message: "Extraction provider returned 503" }` |                 |        |     |            |        |               |          |
| F11     | GEN   | TAX_INVOICE | Alfanar Fuel Company                                             | 300123456700003 |  20000 | SAR | 2025-06-14 | —      | INV-99812     |     0.92 |
| F12     | PHOTO | RECEIPT     | Alfanar Fuel Station 04                                          | 300123456700003 |  10000 | SAR | 2025-06-16 | —      | —             |     0.90 |
| F13     | GEN   | RECEIPT     | Emirates Road Fuel                                               | 100234567800003 |  15000 | AED | 2025-06-19 | 3051   | —             |     0.90 |

Notes:

- **F03** is the pre-tip receipt total; the card was charged 63.25 after a tip was added at the terminal.
- **F09's photo shows `4471`**; the extraction deliberately reads `4477` to simulate a thermal-paper OCR misread.
- **F06** is a blurry, unreadable image; its `rawText` is noise.
- KSA VAT numbers are 15 digits starting and ending with `3`; F13's is a UAE TRN.

---

## 3. End-to-end scenarios (fixtures + seed)

| ID  | Spec edge case  | Channel  | Sender → scope                                          | Fixture | Surviving candidates (score)          | Outcome        | Reasons                    |
| --- | --------------- | -------- | ------------------------------------------------------- | ------- | ------------------------------------- | -------------- | -------------------------- |
| S01 | #1 exact match  | WhatsApp | D1 → C1 txns of D1                                      | F01     | T01 (1.00), T03 (0.88)                | `AUTO_MATCHED` | `ALL_GATES_PASSED`         |
| S02 | #2 ambiguous    | Email    | `to` alias `+najd` → C1 (from = supplier, unregistered) | F02     | T04 (1.00), T05 (1.00)                | `NEEDS_REVIEW` | `NEAR_TIE`                 |
| S03 | #3 tip          | WhatsApp | D2 → C1 txns of D2                                      | F03     | T06 (0.88)                            | `NEEDS_REVIEW` | `AMOUNT_TIP_TOLERANCE`     |
| S04 | #4 duplicate    | WhatsApp | D1                                                      | F01     | — (no new document)                   | —              | duplicate by `contentHash` |
| S05 | #5 no txn yet   | Email    | `from` registered `fleet@najd…` (plain `to`) → C1       | F05     | none (2 by date window, 9 by amount)  | `UNMATCHED`    | `NO_CANDIDATES`            |
| S06 | #6 garbage      | WhatsApp | D1                                                      | F06     | — (not matchable)                     | `UNMATCHED`    | `NOT_MATCHABLE`            |
| S07 | E3 / R21        | Email    | alias `+najd` → C1                                      | F07     | T07 (1.00, already has SD1)           | `NEEDS_REVIEW` | `TXN_ALREADY_HAS_DOCUMENT` |
| S08 | E2 shared last4 | Email    | `from` `fleet@najd…` + alias `+najd` → C1               | F08     | T08 (1.00), T09 (1.00)                | `NEEDS_REVIEW` | `NEAR_TIE`                 |
| S09 | D4 misread      | WhatsApp | D1                                                      | F09     | T10 (0.86)                            | `NEEDS_REVIEW` | `CARD_POSSIBLE_MISREAD`    |
| S10 | R7 / D14        | Email    | alias `+redsea` → C2                                    | F10     | — (extractor throws)                  | `FAILED`       | `EXTRACTION_ERROR`         |
| S11 | E1              | Email    | **spec's literal payload**: supplier `from`, plain `to` | F11     | — (no scope)                          | `UNMATCHED`    | `UNKNOWN_SENDER`           |
| S12 | fleet trap      | WhatsApp | D1                                                      | F12     | T11 (1.00), T12 (0.95)                | `NEEDS_REVIEW` | `NEAR_TIE`                 |
| S13 | E4 / currency   | WhatsApp | D3 → C2 txns of D3                                      | F13     | none (all removed by currency filter) | `UNMATCHED`    | `NO_CANDIDATES`            |

What each scenario proves:

- **S01** — the happy path, _and_ that a repeat refuel 3 days later (T03) does not block it: margin 0.12 ≥ 0.10.
  T02 (same amount, same day, same station, same last4, other client) never appears: **scoping works**.
  T03 is stored as `REJECTED` by `system` (D8).
- **S02** — two identical candidates. Also proves the alias beats an unregistered supplier `from` (E1), and that T04
  (01:30 Riyadh on the 14th, but the 13th in UTC) is compared on the **Riyadh day**.
- **S03** — a tip is plausible but never automatic. T14 (exact amount, other client) is excluded by scope.
- **S04** — two variants: (a) same `wamid` redelivered → duplicate by `externalId`; (b) same photo, new `wamid` and new
  media id → duplicate by `contentHash`.
- **S05** — the document arrives before its transaction. With the B2 bonus (M8), ingesting
  T16 `SAHARA AUTO SVC RUH`, 34000, 2025-06-15 re-matches it to `AUTO_MATCHED`.
- **S07** — receipt-then-invoice (E3): a perfect match is still routed to review because T07 already has SD1.
  Confirming it must be **rejected by the database**.
- **S08** — last4 is not an identifier: two cards ending `4471` in one client tie.
- **S09** — a one-digit card difference keeps the candidate (score 0.86 would pass the threshold) but blocks auto-match.
- **S11** — the spec's own example payload cannot be scoped: the supplier serves many clients, no alias was used.
- **S12** — a preset round amount on consecutive days: a one-day gap (0.05) is not enough separation.
- **S13** — a foreign-currency receipt is never compared to a SAR transaction.

### Score arithmetic (weights: amount .40, date .20, merchant .20, card .20 — renormalized over present signals)

| Candidate | amount | date      | merchant | card   | Weighted sum            | Score |
| --------- | -----: | --------- | -------: | ------ | ----------------------- | ----: |
| S01 → T01 |    1.0 | 1.0 (0 d) |      1.0 | 1.0    | .40 + .20 + .20 + .20   |  1.00 |
| S01 → T03 |    1.0 | 0.4 (3 d) |      1.0 | 1.0    | .40 + .08 + .20 + .20   |  0.88 |
| S02 → T04 |    1.0 | 1.0       |      1.0 | absent | (.40 + .20 + .20) / .80 |  1.00 |
| S03 → T06 |    0.7 | 1.0       |      1.0 | 1.0    | .28 + .20 + .20 + .20   |  0.88 |
| S09 → T10 |    1.0 | 1.0       |      1.0 | 0.3    | .40 + .20 + .20 + .06   |  0.86 |
| S12 → T11 |    1.0 | 1.0 (0 d) |      1.0 | absent | (.40 + .20 + .20) / .80 |  1.00 |
| S12 → T12 |    1.0 | 0.8 (1 d) |      1.0 | absent | (.40 + .16 + .20) / .80 |  0.95 |

---

## 4. Ingestion-only scenarios (HTTP + persistence behaviour)

| ID  | Payload                                                      | HTTP | Effect                                                                 |
| --- | ------------------------------------------------------------ | ---- | ---------------------------------------------------------------------- |
| I01 | Email missing `attachments`                                  | 400  | No document; body lists Zod issue paths                                |
| I02 | WhatsApp with `entry` not an array                           | 400  | No document                                                            |
| I03 | WhatsApp status-only event (no `messages`)                   | 200  | `ignored` — no document                                                |
| I04 | WhatsApp `type: "text"` message                              | 200  | `ignored` — no document                                                |
| I05 | WhatsApp image with unknown media id (`media_9999`)          | 200  | Document created as `FAILED` (`MEDIA_UNAVAILABLE`), `contentHash` null |
| I06 | Valid WhatsApp envelope with one message missing `image.id`  | 200  | Bad message skipped and logged; valid siblings processed (D7)          |
| I07 | Email with a 2 KB `logo.png` plus the real PDF (S02 payload) | 200  | Logo `ignored`; one document for the PDF                               |
| I08 | Email with two document attachments (test builders)          | 200  | Two documents: `externalId` `msg:0` and `msg:1`                        |
| I09 | Same payload delivered twice concurrently (test only)        | 200  | Exactly one document (unique constraint wins the race)                 |
| I10 | Database unavailable during intake (test only)               | 500  | Nothing persisted → provider retry is the safety net                   |

---

## 5. Matcher unit-only scenarios (built with test builders, no fixtures)

| ID  | Situation                                                     | Expected                                         |
| --- | ------------------------------------------------------------- | ------------------------------------------------ |
| U01 | Perfect match but `extractionConfidence` 0.65                 | `NEEDS_REVIEW` · `LOW_OCR_CONFIDENCE`            |
| U02 | Exact amount + same day, no merchant name, no card on receipt | `NEEDS_REVIEW` · `WEAK_IDENTITY`                 |
| U03 | Exact amount, 3-day gap, merchant 0.80, no card → score 0.80  | `NEEDS_REVIEW` · `BELOW_AUTO_THRESHOLD`          |
| U04 | Only candidate scores 0.45                                    | `UNMATCHED` · `LOW_SCORE`                        |
| U05 | Receipt 50.00, txn 55.00 at a **fuel** MCC                    | candidate excluded (tip band is restaurant-only) |
| U06 | Receipt 50.00, txn 49.00 (card charged **less**)              | candidate excluded (amount is directional)       |
| U07 | Card `4471` vs `4417` (2 digits differ)                       | candidate excluded                               |
| U08 | Tax invoice dated 20 days after the transaction               | inside invoice window, date signal 0.1           |
| U09 | Receipt dated 2 days **after** the transaction                | excluded (receipt window is −3…+1 days)          |
| U10 | Empty transaction list / empty scope                          | `UNMATCHED` · `NO_CANDIDATES`, never throws      |
| U11 | Rounding: receipt 100.00, txn 100.04                          | amount 1.0 (within 5 halalas)                    |
| U12 | Same inputs in a different order                              | identical result (deterministic tie-break)       |
