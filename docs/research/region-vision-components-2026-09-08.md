# Regional vision: component preservation and identity gates

Date: 2026-09-08. Implementation base: `da7d18038adf2feba3e97c86377d7923b74e816b`.
Status: publication authorized; release checks pending. No automatic review decisions.

## Changes

- Preserve several component observations from one photo. Deduplicate exact rows, retain their local image index, role, component and literal text separately.
- Explicitly label listing/reference photographs; reject observations marked as references or with an out-of-range index. Legacy stored observations remain readable.
- Separate observed game/platform/edition from region and completeness. Check the observed platform in Python, and compute region matching in Python instead of trusting a model boolean.
- Validate `complete`, `game_manual`, `loose` and `sealed` against photographed components. Original edition extras remain required where documented. Different component languages/codes are not automatically rejected as mismatched assembly.
- Do not restore a seller's `complete` value after an inconclusive visual assessment. Propagate that result through common/eBay, Wallapop, Vinted and final condition resolution; do not automatically spend on a second condition call for that unchanged assessment.
- Bump the vision cache policy to v10. Catalog, documentary knowledge, live queue and worker settings are unchanged.

## Real Mini API regression

Repeated the same 28 listing photographs plus three reference photographs using `gpt-4o-mini-2024-07-18`, temperature 0 and a 2,000-output-token ceiling. Same frozen documentary knowledge, with the listing's own prior decision removed. No Astra API calls. The Codex reference was written before revealing the original Mini answers and remains unmodified; it is not independent human ground truth.

| Measure | Before | After |
| --- | ---: | ---: |
| Final identity agreement with Codex | 26/28 | 28/28 |
| Original false-complete cases among target Game Boy entries (25, 27) | 2 | 0 after validation |
| Components preserved in Bad N Rad's single photo | 1 | 2 |
| Input tokens (cached input included) | 890,214 | 900,640 |
| Cached input tokens | 1,920 | 1,920 |
| Output tokens | 3,902 | 9,988 |
| Total tokens | 894,116 | 910,628 |
| Estimated standard API USD | 0.1357293 | 0.1409448 |

The second run cost is calculated from actual response usage, not a billing invoice or Codex cost. Rates checked 2026-09-08: USD 0.15 input, 0.075 cached input and 0.60 output per million tokens, [official pricing](https://developers.openai.com/api/docs/pricing). Cache is already included in input. All 28 responses contain usage and finish with `stop`; offline replay reproduces all 28 normalized outputs.

## Important unresolved model errors

**This is not an approval for unattended regional publication.** The sample contains only five matching Game Boy identities, 22 unrelated platforms/products and one wrong sequel. It is a paired regression, not held-out regional accuracy.

- NBA Live 96 is still called a matching target by Mini's raw boolean, but its observed Mega Drive platform now correctly blocks the Game Boy match.
- Un Indien Dans La Ville keeps its Game Boy identity even with unknown exact market/content.
- Bad N Rad still copies the manual FAH code onto the cartridge and claims `complete`. Both observations are retained; missing box prevents that price condition. The code reading itself is not repaired.
- Mickey and Street Fighter II no longer invent PEGI/Spanish in this repetition; a box front is not treated as complete contents.
- Pinball's raw text still misreads `DMG-PB-NOE` as `DMG-PG-NOE`, and omits it from `productCodes`; Germany is not recovered.
- **Reference contamination remains:** Mario Land 2 copies the reference's ESP code/text into the EUR listing. Namespace labels alone do not solve perceptual contamination. Its wrong-sequel identity blocks acceptance, but that regional observation must not be learned or published automatically.
- Unsupported PEGI now occurs on three other-platform cases (Tetris Attack, PGA European Tour and Micro Machines 2). Identity gates reject those targets, but the observations are not reliable reference data.

No prices, catalog entries or review decisions were produced by this experiment. The 313 pending cases outside the original sample were not evaluated here. A later isolated-perception pass and a genuine held-out Game Boy sample are needed before claiming regional reliability; this PR does not silently rerun or close the queue.

## Reproduction and checks

Offline regression: `python3 scripts/test_region_vision_components.py` (15 tests), connected to Quality.

Additional checks run successfully: `test_region_research.py` (35), `test_reviewed_regional_learning.py` (12), `test_ai_usage.py` (5), `test_ai_balance_pause.py` (3), Wallapop evidence, eBay regional routing, `npm run typecheck`, `npm run lint`, `npm run test:unit` (220 main tests plus pre/post suites), `npm run test:collector-controls`, and `npm run build`.

Lint has 35 pre-existing warnings and zero errors. `npm ci --ignore-scripts` reports one high-severity dependency advisory; no dependency changes or unrelated fixes included. No UI changes, so no claim of new visual QA.

Local evidence retained outside the repository under `artifacts/gameboy-model-comparison-2026-09-08/`: original blind review/responses, `engine-after-snapshot`, `after-snapshot-manifest.json`, `compare_after_fix.py`, `evaluate_after_fix.py`, and `mini-after-component-fix/` (requests, responses, normalized results, token journal, protocol, comparison and Spanish report). `python3 evaluate_after_fix.py` reproduces the comparison without API calls. The real API test covers the two core vision modules; the downstream unknown-condition propagation has separate offline tests.

## Preservation / release boundary

At this branch's base and after implementation: 73,107 catalog rows and 73,107 unique IDs. `data/catalog.json`, `data/index/companies.json` and the eBay review queue are byte-identical to the base. No tracked changes under `data/`, `public/` or `src/`: no IDs, URLs, covers, prices, credits or public pages changed. These counts describe this audit cut, not permanent product assertions.

The user authorized publication after the comparison. Keep this PR's worktree until merge and requested Production validation; other worktrees and the dirty main checkout are untouched. Authorization to publish code does not turn this diagnostic into approved regional decisions.

## Deployment packaging

Both the initial Preview (`dpl_GUqAhKgwrJG6ntFhS9FyayRWukXi`) and the base commit's Production build (`dpl_H3vDKnzzN6WLaxtPHC4regfppmwb`) failed because the `admin/precios` serverless package was 251.66 MB, above Vercel's 250 MB limit. This is packaged code/data, not newly uploaded listing photographs.

The release excludes only `data/migrations/franchise-series-v1/**` and `data/company-role-backfill-report.json` from server output tracing. Consumer search finds the former in offline audit/build/verification scripts and a test, and the latter in the offline company-role backfill script; neither is a runtime input. All files remain in Git and in the build workspace for audits, tests and rollback. Their traced size before exclusion was 2,863,962 bytes. Runtime catalog, company/person research, queue, images, account settings and server storage are unchanged. No Vercel environment variables or function limits are changed.

The second local build passes. Its `admin/precios/page.js.nft.json` decreases from 262,761,923 to 259,897,961 bytes (247.86 MiB on macOS; Vercel's Linux package is verified separately). Trace assertions confirm the offline files are absent, catalog/details/companies/queue and runtime company/person research remain present, and the worker-sync trace includes the updated vision, packaging and condition-resolver scripts. The 15 component tests pass again after the configuration adjustment.
