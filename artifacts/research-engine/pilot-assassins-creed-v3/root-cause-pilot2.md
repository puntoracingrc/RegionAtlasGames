# Pilot 2 root cause: research quality

This document treats Pilot 2 artifacts as diagnostic evidence only. Candidate values from those artifacts are not runtime knowledge, query seeds, or answers for Pilot 3.

## Artifact coverage

Reviewed for all five cases: `router-plan.json`, `queries.json`, `search-results.json`, `pages.json`, `images.json`, `vision-results.json`, `claims.json`, `evidence.json`, `conflicts.json`, `technical-failures.json`, `retrieval-events.json`, `resolution.json`, `retrieval-funnel.json`, and `summary.md`. Pilot 2 did not emit separate `page-attempts.json`, `image-candidates.json`, or `fallback-events.json`; the equivalent data is in `retrieval-funnel.json`, `images.json`, `technical-failures.json`, and `retrieval-events.json`.

## Case 1: Black Flag Resynced PS5 — positive control

- Final status: `CONFIRMED`.
- Target attempted/solved: `CANONICAL_IDENTITY` / solved.
- Strongest evidence: independent Ubisoft and GameFAQs pages bound to the announced PS5 product.
- Sources planned included official publisher, platform holder, technical databases, and guarded release databases. Ubisoft and GameFAQs were useful.
- Seven searches and five useful pages were sufficient. No image inspection was needed.
- Root cause conclusion: no evidence gap. Preserve this route as a positive control and avoid aggressive optimization.
- Regression guard: it must remain confirmed while query count/cost stays equal or lower where possible.

## Case 2: Assassin's Creed II Discovery, Nintendo DS, Spain

- Final status: `PARTIAL`.
- Targets: `BARCODE`, `BOX_CODE`, `PRODUCT_CODE`.
- Solved only to candidate level: barcode and box code. Product/cart code remained unresolved.
- Strongest evidence: Retroplace's multi-version table plus component photos returned by Brave Images.
- Candidate identifiers found: one EAN candidate, one `TWL-...-EUR` box-code candidate, and several rejected cartridge readings from marketplace photos.
- Sources planned: DBox, OGDB, GAME Spain, Retroplace, TodoColeccion, eBay, Nintendo, MobyGames, GameFAQs, and reviewed documentary sources.
- Sources actually useful: Retroplace for the multi-version record; LaunchBox/eBay image results for physical observations. Nintendo technical/No-Intro-style evidence was not reached usefully.
- Queries: 20 total. Initial source-specific title queries dominated. After the EAN appeared, only a subset of exact-identifier verification routes ran before the per-target allocation ended. The product-code target returned no web result and relied on image search.
- Pages: two Retroplace opens, both useful but multi-version and not component-specific.
- Images: 12 discovered, four inspected. The cartridge photos were real physical clues, but listing title/source metadata was not supplied to vision subject binding. Readings attributable to a USA cart were therefore correctly rejected or remained unusable.
- Why barcode was not confirmed: one eligible database source, no second authoritative source and no exact Spanish back-cover photo.
- Why box code was not confirmed: one database row, component `UNKNOWN`; no box-flap/back-cover observation bound to Spain.
- Why product code was unresolved: image discovery found carts, but not a component-bound Spanish/EUR specimen with readable code and complete subject metadata.
- Router defect: new identifiers caused replanning, but `MISSING_BARCODE` remained selected and exact identifiers were not promoted ahead of remaining generic/source-title queries. Only the first identifier of a type was rendered into templates.
- Evidence that would close it: exact quoted EAN corroboration; Spanish back cover; box flap showing the box code; EUR/Spanish cart-front photo or exact Nintendo technical record.
- Playbook knowledge gap: no explicit `VERIFY_IDENTIFIER` route and no Nintendo box/cart separation rule driving the next evidence request.

## Case 3: Black Flag Skull Edition, Wii U, Spain

- Final status: `PARTIAL`.
- Targets: `BARCODE`, `BOX_CODE`, `CANONICAL_IDENTITY`.
- Candidate-level results: barcode and canonical base-game identity. Box code ended in conflict.
- Strongest evidence: a Wii U Retroplace page and a separate Retroplace Skull Edition result; official Nintendo established the base Wii U release, not the Skull/Spain packaging identity.
- Sources planned: DBox, OGDB, GAME Spain, Retroplace, Ubisoft, Nintendo, MobyGames, GameFAQs, marketplaces.
- Sources actually useful: Retroplace for identifiers; Nintendo/Ubisoft for base title only. No Spanish Skull physical specimen was established.
- Queries: the highest-value queries did not consistently contain `Skull Edition`. The edition string also leaked `barcode pendiente`, reducing precision. Generic title-plus-platform and broad official queries dominated.
- Results: Brave returned Standard, PS4 Skull, PC, Xbox, Resynced, Black Chest, and base Wii U results. Several were opened because title matching outweighed edition matching.
- Pages: 16 opened. Many were useful for the franchise/base game but not for the exact Skull Wii U Spain variant.
- Images: eight discovered, two inspected; they were predominantly Standard Wii U packaging, not Skull outer packaging.
- Why barcode remained partial: one eligible source with unknown component and insufficient Skull/Spain binding.
- Why box code conflicted: a placeholder (`barcode pendiente`) was extracted as a claim and a German/standard-looking code was associated without the required edition/component proof.
- Why canonical identity remained partial: official sources corroborated the base title but not the Skull edition identity.
- Router defect: no edition-first rule; placeholder sanitization was incomplete; result relevance did not require edition tokens for collector/special editions.
- Evidence that would close it: Skull-specific official/retailer record plus a photo of the outer Skull package, with barcode location classified as outer package, inner case, sticker, or unknown.
- Playbook knowledge gap: collector edition names and outer/inner component choices were not used to control search and extraction.

## Case 4: The Ezio Collection, Nintendo Switch

- Final status: `UNRESOLVED`.
- Targets: `PRODUCT_CODE`, `PHYSICAL_PRODUCT_TYPE`.
- Strongest evidence: official Ubisoft Switch announcements and a real Switch cartridge image. DoesItPlay evidence opened by the worker was for PS4, not Switch.
- Candidate identifiers found: false textual counters and ASCII-art digits, plus rejected PS4 identifiers. None was a valid Switch component code.
- Sources planned: Ubisoft, Nintendo, DoesItPlay, DBox, OGDB, GameFAQs, national retailers, marketplaces.
- Sources actually useful: Ubisoft for existence/content list; a marketplace image for physical cartridge existence. DoesItPlay PS4 pages were not useful for the Switch target.
- Queries: 20 total. Source order was broadly appropriate, but queries lacked strict Switch URL/platform constraints and did not prioritize closed download-statement evidence after official existence was established.
- Pages: nine opened. Two official Switch pages were relevant. Two DoesItPlay PS4 pages and a GameFAQs walkthrough were opened because the expected platform appeared elsewhere in snippets/page text.
- Images: four cartridge/code-in-box candidates discovered, only one inspected due token reservation. The image proved a physical cartridge exists but did not answer content distribution.
- Why product code was unresolved: no exact HAC/TSA-HAC/LA-H component text; generic page numbers and walkthrough ASCII art were extracted as identifiers before source-capability rejection.
- Why physical product type conflicted: free-form values such as `software`, `collection`, `standard`, and `Game` were accepted as competing values. There was no closed taxonomy for full game, download-required, partial download, or code-in-box.
- Router defect: page relevance allowed PS4 pages when `Switch` appeared in related-links text; image/vision task did not receive a closed question about download/code statements.
- Evidence that would close it: exact Switch DoesItPlay entry or back-cover/unboxing evidence showing cart, download statement, and which games/content are on cart versus downloaded.
- Playbook knowledge gap: no Switch-specific physical-content route and no deterministic rejection of non-taxonomy physical-type values.

## Case 5: Brotherhood + Revelations Double Pack, Xbox 360

- Final status: `UNRESOLVED`.
- Targets: `OUTER_INNER_RELATION`, `CANONICAL_IDENTITY`.
- Strongest evidence: Retroplace's `Assassin's Creed Compilation` record and one outer-box image. Subject binding correctly flagged the naming mismatch rather than accepting it.
- Candidate identifiers available to the evaluation: four EAN/UPC values. The worker only rendered and pursued the first one.
- Sources planned: Ubisoft, OGDB, Retroplace, MobyGames, GameFAQs, retailers, marketplaces, documentary sources. DBox was absent because its platform list excluded Xbox 360.
- Sources actually useful: Retroplace and the outer-box image; neither established the complete outer-to-inner mapping.
- Queries: 20 total. Title searches and the first barcode were repeated across targets. The other three exact identifiers were never independently searched.
- Pages: two opens of the same Retroplace record.
- Images: two duplicate outer-package candidates discovered, one inspected.
- Why outer/inner relation was unresolved: the claim schema had no useful closed representation for `outer Double Pack`, `Brotherhood standalone`, `Revelations standalone`, `other`, or `unreadable`, and no barcode-to-component pair was observed.
- Why canonical identity was unresolved: `Assassin's Creed Compilation` was not safely bound to the requested Double Pack; no independent exact identifier/title evidence resolved the alias.
- Router defect: only the first identifier of each type was rendered; exact EAN routes were lower priority than title routes; DBox was incorrectly unavailable for Xbox 360.
- Evidence that would close it: exact searches for every candidate EAN; DBox/OGDB records; photos of outer pack and each inner case; closed component classification using listing/page title plus visible text.
- Playbook knowledge gap: no enumerated identifier fan-out and no barcode-to-component decision model.

## Cross-case source capability audit

- Retroplace: useful for discovery and candidate identifiers, but multi-version tables and unknown components do not independently confirm region/component. Its barcode/box/product capability must remain conditional on exact row and component binding.
- OGDB: useful for edition/release discovery; broad title pages aggregate platforms/editions. Exact game records or images are required for identifiers.
- DBox: strong for component-bound identifiers, but Xbox 360 was incorrectly excluded. Platform support should include Xbox 360; result relevance must still reject a different platform.
- Ubisoft/Nintendo: high for canonical identity, existence, and official contents; insufficient alone for packaging barcode/language/component claims.
- DoesItPlay: high for physical-content distribution only when exact platform/version matches. Related or alternate-platform pages must be rejected before opening.
- GameFAQs: useful for release identity; walkthroughs and board pages are poor identifier sources and must not yield physical identifiers.
- Marketplaces: useful for exact physical photos/listing discovery; descriptions and aggregate product pages remain low reliability without component-bound imagery.

## Query-quality baseline

Pilot 2 overused source-specific title queries and underused exact-identifier fan-out. The critical behavior change is not a larger budget: once a valid identifier appears, remaining generic title work must yield to exact quoted identifier variants and high-value sources. Collector editions must retain their edition token. Physical-content targets must search for the exact closed evidence gap (`download required`, `code in box`, `back cover`, `unboxing`) rather than generic product identity.

## Required routing changes derived from evidence

1. Add an explicit `VERIFY_IDENTIFIER` route that fans out every known EAN/UPC and prioritizes exact quoted queries before title discovery.
2. Add Nintendo code verification and preserve box/cart/manual separation.
3. Sanitize pending placeholders and require collector-edition tokens in high-value queries/results.
4. Reject alternate-platform pages before opening when the target is component or physical-content specific.
5. Add a closed physical-content assessment and reject free-form physical-type values.
6. Pass listing/source metadata to vision binding and add closed component/barcode binding for outer/inner research.
7. Enable DBox for Xbox 360 and lower source confidence whenever evidence is aggregate, multi-version, or component-unknown.
8. Emit an explicit evidence gap per target and route the next round from that gap.

