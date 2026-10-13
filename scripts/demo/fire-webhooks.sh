#!/usr/bin/env bash
# Fires every sample webhook payload at a running server, in scenario order (docs/SCENARIOS.md §3–§4).
# Usage: scripts/demo/fire-webhooks.sh [base-url]   (default http://localhost:3000)
set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCENARIOS="$ROOT/fixtures/scenarios"
INGESTION="$ROOT/fixtures/payloads/ingestion"

post() {
  local label="$1" channel="$2" file="$3"
  printf '\n▶ %s\n  ' "$label"
  curl -sS -X POST "$BASE_URL/api/webhooks/$channel" -H 'content-type: application/json' --data-binary "@$file" \
    -w '  [HTTP %{http_code}]\n'
}

post "S01 exact match (WhatsApp)"                    whatsapp "$SCENARIOS/01-exact-match/payload.json"
post "S04a redelivery of S01 → duplicate (externalId)" whatsapp "$SCENARIOS/01-exact-match/payload.json"
post "S04b same photo, new message → duplicate (contentHash)" whatsapp "$SCENARIOS/04-duplicate-photo/payload.json"
post "S02 same chain, same amount, same day (email)"  email    "$SCENARIOS/02-ambiguous-same-chain/payload.json"
post "S03 restaurant tip (WhatsApp)"                  whatsapp "$SCENARIOS/03-restaurant-tip/payload.json"
post "S05 invoice before its transaction (email)"     email    "$SCENARIOS/05-invoice-no-transaction/payload.json"
post "S06 unreadable photo (WhatsApp)"                whatsapp "$SCENARIOS/06-garbage-extraction/payload.json"
post "S07 invoice for an already-documented txn"      email    "$SCENARIOS/07-invoice-after-confirmed-receipt/payload.json"
post "S08 two cards share last4 (email)"              email    "$SCENARIOS/08-shared-last4/payload.json"
post "S09 card digit misread (WhatsApp)"              whatsapp "$SCENARIOS/09-card-misread/payload.json"
post "S10 extractor fails (email)"                    email    "$SCENARIOS/10-extractor-error/payload.json"
post "S11 the brief's example payload: unknown sender" email   "$SCENARIOS/11-unknown-sender/payload.json"
post "S12 back-to-back round-amount refuels"          whatsapp "$SCENARIOS/12-back-to-back-refuel/payload.json"
post "S13 foreign-currency receipt"                   whatsapp "$SCENARIOS/13-foreign-currency/payload.json"
post "I01 malformed email → 400"                      email    "$INGESTION/i01-email-missing-attachments.json"
post "I02 malformed WhatsApp → 400"                   whatsapp "$INGESTION/i02-whatsapp-entry-not-array.json"
post "I03 status-only event → ignored"                whatsapp "$INGESTION/i03-whatsapp-status-only.json"
post "I04 text message → ignored"                     whatsapp "$INGESTION/i04-whatsapp-text-message.json"
post "I05 unknown media → FAILED, not lost"           whatsapp "$INGESTION/i05-whatsapp-unknown-media.json"
post "I06 one invalid message in a valid delivery"    whatsapp "$INGESTION/i06-whatsapp-one-invalid-message.json"

printf '\n▶ B2 card feed delivers S05'"'"'s transaction late → S05 re-matched\n  '
curl -sS -X POST "$BASE_URL/api/transactions" -H 'content-type: application/json' -w '  [HTTP %{http_code}]\n' \
  -d '{"externalRef":"feed-T16","clientId":1,"cardId":3,"driverPhone":"+966554445566","merchantName":"SAHARA AUTO SVC RUH","mcc":"7538","amount":34000,"transactionAt":"2025-06-15T08:00:00Z"}'

printf '\nDone. Processing runs after each response; see the outcome with: npm run db:report\n'
