# Fixture provenance

Every file in `fixtures/` was created for this project. None contains personal data: merchants, VAT numbers, phone
numbers, card digits and amounts are fictional and come from [`docs/SCENARIOS.md`](../docs/SCENARIOS.md).

| File(s)                                                                   | Origin                                                                                                                                                                                                         |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scenarios/{02,05,07,10,11}-*/document.pdf`                               | Generated A4 tax invoices — `scripts/fixtures/render-receipts.ts` (pdf-lib, fixed metadata)                                                                                                                    |
| `scenarios/{08,13}-*/document.jpg`                                        | Generated receipt images — same script (SVG rendered by sharp, seeded paper grain)                                                                                                                             |
| `scenarios/06-garbage-extraction/document.jpg`                            | Generated unreadable image (blurred text under noise) — same script                                                                                                                                            |
| `scenarios/{01,03,09,12}-*/document.jpg`                                  | **Photo scenarios.** Until replaced: a generated "interim photo" (tilted receipt on a grey desk). Final: a phone photo of the printed receipt below, EXIF/GPS stripped by `scripts/fixtures/sanitize-photo.ts` |
| `print/receipt-*.pdf`                                                     | Print-ready 80 mm thermal receipts for the photo scenarios — `render-receipts.ts`                                                                                                                              |
| `assets/logo.png`                                                         | Generated signature logo (intake must ignore it) — `render-receipts.ts`                                                                                                                                        |
| `scenarios/*/extraction.json`                                             | Hand-written mock OCR results (`docs/SCENARIOS.md` §2). `09` deliberately misreads the printed card `4471` as `4477`                                                                                           |
| `scenarios/*/payload.json`, `media-map.json`, `payloads/ingestion/*.json` | Generated from the documents — `scripts/fixtures/build-sample-payloads.ts` (base64 and sha256 always match the committed bytes)                                                                                |

## Replacing an interim photo with a real one

1. Print `print/receipt-<scenario>.pdf` at 100 % scale (80 mm wide) on plain paper.
2. Photograph it with a phone — hand-held, normal room light, a little tilt is fine.
3. `npm run fixtures:sanitize -- <photo.jpg> <scenario-folder>` (e.g. `01-exact-match`).
4. `npm run fixtures:payloads` so the payloads carry the new bytes and hash.
