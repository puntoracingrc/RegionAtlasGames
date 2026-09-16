# RegionAtlas Engine + Codex Review Benchmark — PILOT_16

## Scope and freeze

- Base SHA: `cc46b050b07e7ad3522ba8b233a8e7f9b4154752`
- Selection freeze: `ed83fda90b810f014523b86055b2617a072eff78e51be579baa8f7232ea57454`
- Selected games: 16 fixed cases; unavailable cases were not replaced.
- Usable listings: 9/16 (56.3%).
- Preflight: all usable cases were `NOT_DEEPLY_ANALYZED`.
- Engine results were frozen before the Codex review queue was created.
- Codex reviewed only `REVIEW_REQUIRED` cases and repeated 0 Engine routes.
- Ground truth was generated after both stages were frozen. The generator excluded Engine/Codex decision files, but perfect human blinding is not claimed because one Codex task executed the benchmark.
- Catalog, price, authoritative queue, and public asset mutations: 0.

## Outcome

The Engine resolved 1 of 9 evaluable cases autonomously (11.1%), but that decision was wrong: the Shadow Man listing was rejected because generic eBay condition boilerplate mentioned VHS/DVD even though high-detail classification found the game box, cartridge, and manual. Engine decision precision is therefore 0/1.

The Engine sent 8 cases to Codex. Codex safely recovered 2 of them (25.0%): both Game Boy listings were rerouted to existing regional siblings using decisive evidence already present in the Engine bundle. The other six cases remained deferred because the selected listings lacked specimen-bound back, disc, seal, or actual-product photos. Exact EAN research improved product-family mapping but could not prove the selected unit.

The combined system produced 3 final non-defer decisions: 2 correct and 1 incorrect. Final precision is 66.7%; global exact resolution is 2/9 (22.2%). Of the two correct resolutions, 100% of the decisive evidence had already been discovered by the Engine and required Codex adjudication.

## Per-case scorecard

| Case | Listing | Engine | Engine correct | Codex | Codex correct | Ground truth | Final | Discovery owner | Engine USD | Codex USD |
|---|---|---|---:|---|---:|---|---|---|---:|---:|
| PS4-01 Fobia: St. Dinfna Hotel | CASE_UNAVAILABLE | — | — | — | — | CASE_UNAVAILABLE | CASE_UNAVAILABLE | UNRESOLVED | 0.000000 | 0.000000 |
| PS4-02 Soul Hackers 2 | USABLE | REVIEW_REQUIRED | — | DEFER | — | DEFER | DEFER | UNRESOLVED | 0.045367 | 0.000000 |
| PS4-03 Atelier Firis: The Alchemist and the Mysterious Journey | CASE_UNAVAILABLE | — | — | — | — | CASE_UNAVAILABLE | CASE_UNAVAILABLE | UNRESOLVED | 0.000000 | 0.000000 |
| PS4-04 Code Vein | USABLE | REVIEW_REQUIRED | — | DEFER | — | DEFER | DEFER | UNRESOLVED | 0.055141 | 0.000000 |
| PS5-01 Demon's Souls | USABLE | REVIEW_REQUIRED | — | DEFER | — | DEFER | DEFER | UNRESOLVED | 0.045502 | 0.000000 |
| PS5-02 Dragon's Dogma 2 | USABLE | REVIEW_REQUIRED | — | DEFER | — | DEFER | DEFER | UNRESOLVED | 0.045087 | 0.000000 |
| PS5-03 Final Fantasy XVI | USABLE | REVIEW_REQUIRED | — | DEFER | — | DEFER | DEFER | UNRESOLVED | 0.045215 | 0.000000 |
| PS5-04 Hogwarts Legacy | USABLE | REVIEW_REQUIRED | — | DEFER | — | DEFER | DEFER | UNRESOLVED | 0.045581 | 0.000000 |
| N64-01 Holy Magic Century | CASE_UNAVAILABLE | — | — | — | — | CASE_UNAVAILABLE | CASE_UNAVAILABLE | UNRESOLVED | 0.000000 | 0.000000 |
| N64-02 Aidyn Chronicles | CASE_UNAVAILABLE | — | — | — | — | CASE_UNAVAILABLE | CASE_UNAVAILABLE | UNRESOLVED | 0.000000 | 0.000000 |
| N64-03 Hybrid Heaven | CASE_UNAVAILABLE | — | — | — | — | CASE_UNAVAILABLE | CASE_UNAVAILABLE | UNRESOLVED | 0.000000 | 0.000000 |
| N64-04 Shadow Man | USABLE | REJECT | no | — | — | ACCEPT_EXISTING → n64-shadow-man | REJECT | UNRESOLVED | 0.011851 | 0.000000 |
| GB-01 Lock 'n' Chase | USABLE | REVIEW_REQUIRED | — | REROUTE_EXISTING | yes | REROUTE_EXISTING → gameboy-japon-lock-n-chase | REROUTE_EXISTING | ENGINE_DISCOVERED_CODEX_ADJUDICATED | 0.096261 | 0.000000 |
| GB-02 Nail 'n' Scale | USABLE | REVIEW_REQUIRED | — | REROUTE_EXISTING | yes | REROUTE_EXISTING → gameboy-nail-n-scale | REROUTE_EXISTING | ENGINE_DISCOVERED_CODEX_ADJUDICATED | 0.094278 | 0.000000 |
| GB-03 Tumble Pop | CASE_UNAVAILABLE | — | — | — | — | CASE_UNAVAILABLE | CASE_UNAVAILABLE | UNRESOLVED | 0.000000 | 0.000000 |
| GB-04 BurgerTime Deluxe | CASE_UNAVAILABLE | — | — | — | — | CASE_UNAVAILABLE | CASE_UNAVAILABLE | UNRESOLVED | 0.000000 | 0.000000 |

## Platform summary

| Platform | Attempted | Available | Engine decided/correct | Review | Codex resolved/correct | Final resolved/correct |
|---|---:|---:|---:|---:|---:|---:|
| ps4 | 4 | 2 | 0/0 | 2 | 0/0 | 0/0 |
| ps5 | 4 | 4 | 0/0 | 4 | 0/0 | 0/0 |
| n64 | 4 | 1 | 1/0 | 0 | 0/0 | 1/0 |
| gameboy | 4 | 2 | 0/0 | 2 | 2/2 | 2/2 |

## Root causes and learning candidates

1. The only autonomous Engine decision was a false negative caused by unscoped description-token rejection over seller boilerplate.
2. Five modern listings exposed exact identifiers in Browse API metadata, but those low-trust identifiers did not reach the Engine bundle; the router therefore spent most searches on generic title/source templates.
3. The Game Boy bundles already contained decisive market evidence, but the Engine did not adjudicate the existing regional siblings.
4. Six modern cases hit a real evidence boundary: external product records cannot replace photos of the selected unit for condition, seal, contents, or exact packaging.
5. These findings are recorded only in `learning-candidates.json`; no Engine knowledge or behavior was changed during the exam.

## Cost and safety

- Engine retrieval: $0.360000
- Engine AI: $0.124281
- Engine total: $0.484281
- Codex repository-billed retrieval/AI: $0.000000 (integrated Codex cost is not observable in repository API billing)
- Total measurable API cost: $0.484281
- Cost per final correct case: $0.242140
- False accepts, wrong reroutes, unsupported market promotions, cross-component attribution, cross-listing attribution, and fabricated identifiers: 0.
- Wrong rejects: 1.

TOTAL SELECTED GAMES: 16

USABLE CASES: 9
GROUND-TRUTH EVALUABLE CASES: 9

ENGINE
------
AUTONOMOUS COVERAGE: 1/9 (11.1%)
DECISION PRECISION: 0/1 (0%)
GLOBAL EXACT RESOLUTION: 0/9 (0%)
REVIEW REQUIRED RATE: 8/9 (88.9%)
CRITICAL ERRORS: 1 (WRONG_REJECT=1)

CODEX
-----
REVIEWED: 8
RESOLVED: 2/8 (25%)
PRECISION: 2/2 (100%)
SALVAGE RATE: 2/8 (25%)
CRITICAL ERRORS: 0

END TO END
----------
FINAL COVERAGE: 3/9 (33.3%)
FINAL PRECISION: 2/3 (66.7%)
GLOBAL EXACT RESOLUTION: 2/9 (22.2%)
UNRESOLVED: 6

RESOLUTION CREDIT
-----------------
ENGINE: 0/2 (0%)
CODEX: 2/2 (100%)

DISCOVERY ATTRIBUTION
---------------------
ENGINE DISCOVERED + ENGINE RESOLVED: 0/9 (0%)
ENGINE DISCOVERED + CODEX ADJUDICATED: 2/9 (22.2%)
JOINT DISCOVERY: 0/9 (0%)
CODEX DISCOVERED: 0/9 (0%)
UNRESOLVED: 7/9 (77.8%)

COST
----
ENGINE: $0.484281
CODEX: $0.000000 measurable repository API cost
TOTAL: $0.484281
COST / FINAL CORRECT CASE: $0.242140
