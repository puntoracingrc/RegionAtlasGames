# Benchmark closure — current RegionAtlas Research Engine — 16 games

## Frozen boundary

- Engine commit: `afb90285994c57010a31fabb843b888402332476`
- Search provider: Brave Search
- Text model: `gpt-4o-mini`
- Vision: disabled at the worker dependency boundary
- OCR: unavailable and unused
- Brave Images: 0 calls
- Image inspection: 0 calls
- Knowledge, routing, thresholds and rules: identical before/after (`799a959eda53f28c7dc0a69583573f98d8a71c143f91dbc0f3febbbf8adc020e`)
- Catalog and price boundary: identical before/after (`8caf709eb8218a072dc12f91cec4fa8669b9253c32602f25f15742898b7c4375`)
- Frozen benchmark hash: `cc3607bbc6ccc0ecb39008f12c9c67484444e637e1ceba934170b7b5455e371c`

The benchmark did not manufacture research targets. For every requested title it asked the current catalog scanner for the exact title/platform family. Eleven active cases produced no research task and were therefore left as `ACCEPT_EXISTING` by the current Engine state, with no web query and zero cost. This is a passive scanner decision, not fresh external corroboration. Four cases produced a `MARKET_REGION` task. One exact catalog family was already excluded and ended as `REJECT`.

## Results by game

| Case | Initial RegionAtlas context | Engine action | Result | Cost |
|---|---|---|---|---:|
| PS4-01 A Plague Tale: Innocence | PAL España, USA and Focus Store records | No risk/task generated | `ACCEPT_EXISTING` | $0.000000 |
| PS4-02 Valkyria Chronicles 4 | PAL España and USA family/edition records | No risk/task generated | `ACCEPT_EXISTING` | $0.000000 |
| PS4-03 The Surge 2 | PAL España and USA family/edition records | No risk/task generated | `ACCEPT_EXISTING` | $0.000000 |
| PS4-04 A Way Out | PAL España and USA records | No risk/task generated | `ACCEPT_EXISTING` | $0.000000 |
| PS5-01 A Plague Tale: Requiem | PAL España and USA standard/collector family | No risk/task generated | `ACCEPT_EXISTING` | $0.000000 |
| PS5-02 Steelrising | PAL España, Royale and USA records | No risk/task generated | `ACCEPT_EXISTING` | $0.000000 |
| PS5-03 Wo Long: Fallen Dynasty | PAL España, USA, Japón and edition records | No risk/task generated | `ACCEPT_EXISTING` | $0.000000 |
| PS5-04 Dead Space | PAL España and USA standard/collector records | No risk/task generated | `ACCEPT_EXISTING` | $0.000000 |
| N64-01 1080° Snowboarding | Exact PAL España record is `excluded`, reason `not-in-museum-pal` | No public scanner subject | `REJECT` | $0.000000 |
| N64-02 Mystical Ninja Starring Goemon | USA + generic PAL Europa | `MARKET_REGION`; found EAN `4988602602487` and product code `NUS-NGMP-EUR`, but market proof stayed weak | `REVIEW_REQUIRED` | $0.061461 |
| N64-03 Star Wars: Rogue Squadron | PAL Europa + USA catalog records | No risk/task generated for the scanner match | `ACCEPT_EXISTING` | $0.000000 |
| N64-04 Body Harvest | USA + generic PAL Europa | `MARKET_REGION`; Nintendo64Ever and OGDB independently corroborated `PAL Europa` | `ACCEPT_EXISTING` | $0.035793 |
| GB-01 Dr. Mario | Japón, PAL Europa, PAL España, USA and Player's Choice records | `MARKET_REGION`; `PAL España` remained a 0.62 candidate without independent binding | `REVIEW_REQUIRED` | $0.031468 |
| GB-02 Kirby's Dream Land | PAL España/USA and edition records | No risk/task generated | `ACCEPT_EXISTING` | $0.000000 |
| GB-03 Mole Mania | USA, PAL Europa and PAL España | `MARKET_REGION`; found `DMG-AMOP-EUR`, while `PAL Europa` remained a 0.738 candidate | `REVIEW_REQUIRED` | $0.051922 |
| GB-04 Gargoyle's Quest | PAL España + USA exact-title records | No risk/task generated | `ACCEPT_EXISTING` | $0.000000 |

## Active research details

### N64-02 — Mystical Ninja Starring Goemon

- Sources actually used: eBay, Retroplace, `www.gameplaystores.es` candidate.
- URLs opened: MobyGames credits and screenshots, eBay ES product page, eBay listing `116508358537`, two Retroplace pages, Gameplay Stores and the Spanish Fandom page.
- Queries: 12, including source-specific title searches followed by exact searches for `4988602602487` and `NUS-NGMP-EUR`.
- Identifiers: EAN candidate `4988602602487`; product-code candidate `NUS-NGMP-EUR`; components remained unbound/unknown.
- Result: `MARKET_REGION` unresolved; stopped at the current search budget with exact-market packaging/legal/distributor proof still missing.
- Conflicts: 0.
- Image URLs: 62, stored as `IMAGE_URL_FOUND`; none read or classified.
- Recovered retrieval failures: 6. Unrecovered: 0.

### N64-04 — Body Harvest

- Sources actually used: Nintendo64Ever and OGDB.
- URLs opened: UVList, Nintendo64Ever data sheet and OGDB game record.
- Queries: 7 exact/source-specific searches around the already-known EAN `5013658086871` and title.
- Confirmed fact: `MARKET_REGION = PAL Europa`, score 1.615, independently corroborated by Nintendo64Ever and OGDB.
- Conflicts: 0; unresolved fields: 0.
- Image URLs: 21, stored as `IMAGE_URL_FOUND`; none read or classified.
- Recovered retrieval failures: 2. Unrecovered: 0.

### GB-01 — Dr. Mario

- Sources actually used: Amazon ES candidate, Retroplace candidate, Nostalgic Video Games candidate and an existing RegionAtlas legacy evidence route.
- URLs opened: Amazon ES `B00002ST3E`, eBay ES product `1444700809`, Retroplace and Nostalgic Video Games.
- Queries: 6 title/source-specific searches for physical edition, product code, barcode and packaging/distributor legal text.
- Candidate fact: `MARKET_REGION = PAL España`, score 0.62. It did not meet the confirmation threshold.
- Conflicts: 0.
- Image URLs: 129, stored as `IMAGE_URL_FOUND`; none read or classified.
- Review reason: independent market-bound proof is still missing.

### GB-03 — Mole Mania

- Sources actually used: eBay, Retroplace candidate, Video Game Sage candidate and an existing RegionAtlas legacy evidence route.
- URLs opened: eBay US/ES product pages, two Retroplace pages, an Etsy replacement-label listing and Video Game Sage.
- Queries: 10; after finding `DMG-AMOP-EUR`, the Engine replanned to exact identifier/source-specific searches.
- Identifier: `PRODUCT_CODE = DMG-AMOP-EUR`, component unbound.
- Candidate fact: `MARKET_REGION = PAL Europa`, score 0.738. It did not meet the confirmation threshold.
- Conflicts: 0.
- Image URLs: 161, stored as `IMAGE_URL_FOUND`; none read or classified.
- Recovered retrieval failures: 3. Unrecovered: 0.
- Review reason: independent market-bound proof is still missing.

The full direct URL lists, exact queries, claims, gaps and source metadata are in each case's `report.md` and `result.json`. The complete unanalysed image inventories are in each case's `image-urls.json`.

## Aggregate

- Total cases: 16
- Investigable by the current public catalog scanner: 15
- Cases for which the scanner generated external-research tasks: 4
- Resolved: 13
- Review required: 3
- Decisions: 12 `ACCEPT_EXISTING`, 1 `REJECT`, 3 `REVIEW_REQUIRED`, 0 `REROUTE_EXISTING`, 0 `PROPOSE_NEW_VARIANT`
- PS4: 4/4 resolved
- PS5: 4/4 resolved
- Nintendo 64: 3/4 resolved, 1 review
- Game Boy: 2/4 resolved, 2 review
- Cases with image URLs: 4/16 = 25%
- Cases where the Engine established that only image analysis remained: 0/16 = 0%. The three reviews still had non-visual legal/distributor/exact-market routes available, so they were not labelled image-only.
- Brave web calls: 35
- Brave image calls: 0
- Text-model calls: 19
- Vision calls: 0
- OCR calls: 0
- OpenAI text cost: $0.005644
- Brave cost: $0.175000
- Total cost: $0.180644
- Cost per case: $0.011290

## Mutation ledger

```text
CATALOG MUTATIONS = 0
PRICE MUTATIONS = 0
AUTHORITATIVE QUEUE MUTATIONS = 0
PUBLIC ASSET MUTATIONS = 0
```
