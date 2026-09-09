# PC price review: image evidence v2

## Scope

Fix the five-listing diagnostic failure in `auto_price_review_vision.py`.
This does not change the eBay collector search, scanner, catalog, price history,
company data, or production queue. No automatic decisions or prices were applied.

Original implementation base: `0c16a42814a291ffed7e762c3e0a31466e5a0a47`.
The previous PR217 diagnosis used the exact same five listings and images.

## Changes

- Two focused API calls using the existing configured model, default `gpt-4o-mini`.
  First read the current images without seller text, catalog identity or research.
  Then interpret the fixed reading with the target, seller claims and existing research.
- Reference photographs cannot displace current-photo indexes. Identical eBay
  thumbnails/high-resolution variants are sent only once, using the largest saved image.
- Strict structured output, explicit photo provenance and same-photo OCR quotes.
  Unquoted ratings, codes, barcodes, distributors and edition markers are removed.
- The interpreter cannot add or change observations. Documentary distribution rules
  still recognise a visible known distributor/sticker; references are not discarded.
- Independent identity, product kind, contents and regional conclusions. A closed
  front view can identify the game without proving a complete set or country.
- Versioned `coverVision` keeps model IDs, response IDs, observations, validation
  warnings and the model's original explanation. The displayed conclusion is
  generated from validated fields, not unrestricted model prose.
- Existing queue identity, detected region, condition, confidence, decisions and
  prices are preserved. The admin can consume fully supported v2 evidence, but
  partial/negative evidence cannot inherit stale certainty or assumed contents.
  Saved v2 evidence is not sent through the legacy web vision prompt again.
- Responses API tokens are journaled through the existing batch ledger, including
  both stages; cached input is not counted twice. Billing failures stop the job.

## Real diagnostic sample

All calls used `gpt-4o-mini-2024-07-18`. One actual front photo per listing;
the two supplied image URLs were size variants of that same photograph.

| Listing ID | Game/product | Final engine assessment |
| --- | --- | --- |
| 326091056529 | Mickey's Dangerous Chase | Identity recognised; country/contents unresolved |
| 800395252020 | Street Fighter II | Identity recognised; French/Dutch packaging text observed |
| 157686535662 | Nail 'n Scale | Identity recognised; no invented ESRB/barcode retained |
| 133634344607 | Monster Truck Wars fridge magnet | Non-game product |
| 375973039198 | Montezuma's Return PC | Wrong platform for the Game Boy target |

Final application to a copy of the frozen queue: 3 identified, 2 not target,
0 valuation-ready, 0 remote writes, 0 catalog writes. The already-rejected magnet
was NOT submitted to production a second time. Nothing was automatically learned
as a human-confirmed regional specimen.

Four development iterations were retained, not cherry-picked away. The first
still copied documentary codes; separating perception fixed that contamination.
Further iterations exposed model misclassification, spurious sealed wording and
one malformed multilingual explanation. The final field-based presentation does
not repeat those explanations as validated facts. The final normalizer was replayed
against the recorded responses without additional API calls.

This is a diagnostic regression sample, NOT a representative accuracy benchmark.
The mini still makes secondary transcription/component mistakes (including an
occasional unobserved seal role). Same-photo quotation establishes traceability,
not independent visual truth. No claim of perfect OCR, expert equivalence or
mass-review readiness is made. New regions and prices require sufficient evidence.

## Usage

Across all four iterations: 30 responses, 599,143 input tokens, 4,749 output,
0 cached input. Estimated API cost: USD 0.09272085, excluding taxes/account pricing.
Final five-listing run: 10 responses, 151,497 input, 1,259 output; USD 0.02347995.
The deterministic replay made zero API calls.

Rate source (checked 2026-09-09):
https://developers.openai.com/api/docs/models/gpt-4o-mini
Standard rate: USD 0.15 input / 0.60 output per million tokens.
The old 450-token budget was not truncating the original diagnostic responses;
we do not attribute that failure to truncation.

## Reproduction and evidence

Private local root:
`/Users/macbookpro14/Documents/New project 2/artifacts/ebay-review-2026-09-09`.

- `production-pr217/queue-before.json`: frozen original queue.
- `production-pr217/analysis-report.json`: old baseline.
- `vision-v2*/comparison.json`: all development iterations.
- `vision-v2-final/ai-usage/*.jsonl`: actual per-response usage.
- `vision-v2-final/replayed.json`: final deterministic application and preservation checks.
- `compare-vision-v2.py`: explicitly enabled bounded paid test, never overwrites evidence.

Replaying existing responses requires no key or network:

```sh
python3 scripts/replay_price_review_vision_evidence.py \
  --queue /path/to/frozen-queue.json \
  --analysis /path/to/comparison.json \
  --output /path/to/new-replay.json
```

The replay rejects duplicate sample IDs, preserves prior evidence and compares
all protected queue fields before/after. It refuses to overwrite an existing report.
No photographs or full private queue dumps are committed to Git.

## Verification

- 18 focused offline tests, included in `test:collector-controls`.
- Existing image-review and regional component tests pass.
- Token ledger tests pass for Chat Completions and Responses usage.
- Admin tests cover partial/negative evidence, stale certainty, usable complete
  evidence and regional mismatch without modifying queue state.
- Typecheck, lint, unit tests, collector controls, scanner tests, affiliate tests
  and build pass locally. Lint retains 35 existing warnings, zero errors.
- The release PR records its final base/HEAD and remote Quality/Preview results.

## Release boundary

Prepared for review, not merged or deployed to Production by this change.
The PC worker must obtain the merged revision before its next review job can use
this code. A Vercel Preview alone does not update the PC worker. Keep the isolated
worktree until merge, required checks and requested production validation finish.
