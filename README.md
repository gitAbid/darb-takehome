# Darb — Receipt & Invoice Matching

Drivers send receipt photos over **WhatsApp**; suppliers and fleet managers email **tax invoices**. This service
receives both through webhooks, extracts their data (OCR is mocked behind an interface), **matches each document to a
card transaction with an explainable confidence score**, auto-attaches only what it is sure about, and routes the grey
zone to a **review queue** with reasons.

- **Design, scoring and every decision with its trade-offs:** [`IMPLEMENTATION.md`](IMPLEMENTATION.md)
- **Architecture, folder map and flow diagrams:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Every scenario with its data and expected outcome:** [`docs/SCENARIOS.md`](docs/SCENARIOS.md)
- **Every business rule and the test that proves it:** [`docs/TEST-INVENTORY.md`](docs/TEST-INVENTORY.md)

## Stack

Next.js 15 (App Router, Route Handlers) · TypeScript 5 (strict) · Prisma 6 + SQLite · Zod 3 · next-safe-action 8 ·
Jest 29 · pino (async logging with rotation)

## Quick start

Requires **Node.js 20.6+** and npm.

```bash
npm install                 # also generates the Prisma client
cp .env.example .env
npm run db:setup            # create the SQLite database (migrations) and load the seed data
npm run dev                 # http://localhost:3000
```

> On npm 11, install scripts are opt-in; `package.json#allowScripts` already approves the Prisma packages. If the
> Prisma client is missing, run `npx prisma generate`.

`npm run db:reset` drops and recreates the database (destructive; use it to start over).

## Fire the sample webhooks

With the app running, in a second terminal:

```bash
npm run demo:webhooks       # posts every scenario payload (S01–S13) and the edge-case payloads (I01–I06)
npm run db:report           # what the pipeline decided: status, reasons, ranked matches with scores
```

Or send them one at a time from [`requests.http`](requests.http) (VS Code _REST Client_ or the JetBrains HTTP client),
or with curl:

```bash
curl -X POST http://localhost:3000/api/webhooks/whatsapp \
  -H 'content-type: application/json' --data-binary @fixtures/scenarios/01-exact-match/payload.json
```

Expected results, for example:

| Payload                         | Response                             | Document after processing                                                    |
| ------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| S01 exact match                 | `200` created                        | `MATCHED` — T01 auto-confirmed (1.00), T03 kept as rejected runner-up (0.88) |
| S01 again (redelivery)          | `200` duplicate (`externalId`)       | unchanged — no second document                                               |
| S04 same photo, new message     | `200` duplicate (`contentHash`)      | unchanged                                                                    |
| S03 restaurant tip              | `200` created                        | `NEEDS_REVIEW` — `AMOUNT_TIP_TOLERANCE`                                      |
| S11 the brief's example payload | `200` created                        | `UNMATCHED` — `UNKNOWN_SENDER` (supplier sender, no client alias)            |
| I01 malformed email             | `400` with the offending field paths | none                                                                         |

The full list is in [`docs/SCENARIOS.md`](docs/SCENARIOS.md). Browse the data with `npx prisma studio`.

## Late transactions (re-matching)

A receipt can arrive before its card transaction. Posting the transaction re-matches waiting documents:

```bash
curl -X POST http://localhost:3000/api/transactions -H 'content-type: application/json' -d '{
  "externalRef": "feed-T16", "clientId": 1, "cardId": 3, "driverPhone": "+966554445566",
  "merchantName": "SAHARA AUTO SVC RUH", "mcc": "7538", "amount": 34000, "transactionAt": "2025-06-15T08:00:00Z"
}'   # → 201; S05 (UNMATCHED) becomes MATCHED — see npm run db:report
```

## Review queue — http://localhost:3000/review

Documents the matcher was unsure about, decided one by one. Built for speed: each candidate is compared side by side
with the document ("+SAR 5.75 (10%) · tip?", "Receipt 4477 vs 4471 · misread?"), reason badges say what to check, and
after a decision the next document opens automatically.

| Key            | Action                       |
| -------------- | ---------------------------- |
| `J` / `K`      | Next / previous document     |
| `1`–`5`        | Pick a candidate             |
| `Enter` or `C` | Confirm the picked candidate |
| `X`            | Reject the picked candidate  |

For look-alike candidates nothing is pre-selected, so a reflex `Enter` can never confirm a coin flip. The layout adapts
from two panes on desktop to list → detail on phones, and follows the system light/dark preference.

<img src="docs/images/review-desktop.jpeg" alt="Review queue on desktop" width="720"> <img src="docs/images/review-mobile.jpeg" alt="Review queue on a phone" width="180">

The page uses the `confirmMatch` / `rejectMatch` server actions in [`lib/actions/review.ts`](lib/actions/review.ts)
(next-safe-action, `{ matchId: number }`), which are also exercised end-to-end in
[`__tests__/e2e/review.e2e.test.ts`](__tests__/e2e/review.e2e.test.ts).

## Tests

```bash
npm test                    # all tests (each test file gets its own migrated SQLite copy)
npm run test:coverage       # with coverage; the build fails below 90 % on any metric
npm run test:mix            # unit / integration / end-to-end balance
```

| Layer                       | What it covers                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `__tests__/unit` (business) | Matcher filters, signals and decision gates; adapters; sender resolution; lifecycle |
| `__tests__/integration`     | Database-enforced rules, repositories, seed, fixtures consistency, logging, storage |
| `__tests__/e2e`             | Real webhook handlers → pipeline → database for every scenario; review actions      |

Other checks: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`.

## Configuration

All optional except `DATABASE_URL`; see [`.env.example`](.env.example). Configuration is validated at startup and fails
fast with the offending variable. In production, logs go to stdout (set `LOG_FILE_ENABLED=true` for rotated, gzipped
files under `logs/`).

**Webhook signatures (bonus B5).** Set `WHATSAPP_APP_SECRET`, `EMAIL_WEBHOOK_SECRET` and
`TRANSACTIONS_WEBHOOK_SECRET` to require an HMAC-SHA256 signature (`X-Hub-Signature-256` for WhatsApp,
`X-Signature-256` otherwise); unsigned or wrongly signed requests get `401`. `WHATSAPP_VERIFY_TOKEN` answers Meta's
`GET` subscription handshake. Unset secrets accept unsigned requests (a warning is logged), so local runs need no setup.
To fire signed demo requests, export the same secrets before `npm run demo:webhooks`. Details:
[IMPLEMENTATION.md §5.6](IMPLEMENTATION.md#56-webhook-authentication-bonus-b5).

## Project layout

```text
app/api/webhooks/{email,whatsapp}/route.ts   HTTP only → lib/container.ts
lib/services/document-ingestion.ts           webhook → document pipeline (facade)
lib/services/transaction-matcher.ts          matching engine (pure)
lib/services/{ingestion,matching,review}/    the focused modules behind those facades
lib/webhooks/                                Zod payload schemas + channel adapters
lib/extraction/  lib/media/  lib/storage/    swappable extractor, media store, blob store
lib/repositories/                            interfaces + Prisma implementations
lib/actions/review.ts                        confirm / reject server actions
prisma/                                      schema, migration (with CHECK constraints), seed
fixtures/                                    scenario documents, extraction results, webhook payloads
scripts/                                     fixture generators, demo scripts, test-mix report
```

The full map and the reasoning behind it are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Fixture photos

Four scenarios (01, 03, 09, 12) use real phone photos of the generated receipts in `fixtures/print/`. To replace one,
photograph the receipt, then:

```bash
npm run fixtures:sanitize -- <photo.jpg> <folder>   # strips EXIF/GPS, resizes
npm run fixtures:payloads                           # regenerates the payloads with the new bytes
```
