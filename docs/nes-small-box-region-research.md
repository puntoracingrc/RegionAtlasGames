# NES small boxes: documentary inspection, 2026-09-07

## Scope and source coverage

- [Guide and discussion](https://foro.spinecard.com/t/nes-guia-de-cajas-pequenas/1683): all 51 posts read through the public Discourse JSON, including corrections after the first post.
- Fourteen image URLs visually inspected in a browser: Punch-Out (1), Athletic World (1), manual sticker (1), Popeye (4), Gumshoe side (1), manual heading crops (2), Super Mario Bros. Israeli comparison (4).
- [Linked Google document](https://docs.google.com/document/d/1Ixf1linjj0O8VSaSSrNkwG-WI5NPZ1O6Pl_sRiNd9qI/edit): all 41 table rows read through the connector. Last modified 2018-03-08. No remote document edited or copied.
- This is not an exhaustive photographic audit of every image or variant in the thread. Partial crops remain partial evidence; manual covers do not demonstrate their interiors.
- No image downloaded, rehosted or passed as a listing image to OpenAI. Source attribution, URLs and individual visual findings are recorded in `data/region-research/nes.json`.

## Useful findings

1. Punch-Out: [post 13](https://foro.spinecard.com/t/1683/13) supplies an open cartridge photo, with Spanish front/rear text and three slotted screw positions. [Post 14](https://foro.spinecard.com/t/1683/14) retracts the assumption that only five-screw cartridges could have flat screws. Neither photo nor testimony authenticates a future listing. Do not reject on that feature alone.
2. Popeye: European Version front with a Spanish-manual sticker, English rear with blue SPACO label, and monochrome manual cover/reverse naming SPACO and Tres Cantos. These are component-level comparison points, not evidence of Spanish ROM, exact printing, compulsory contents, or the current listing.
3. Gumshoe: the side crop visibly reads `NESE-P-GS`. Request the actual listing's side/flaps; this crop supplies no country suffix.
4. Athletic World: the photo shows Bandai instructions with Spanish body text on a Family Fun Fitness box. It does not establish a SPACO association or prove that an individual game included a mat or that exact sheet.
5. Super Mario Bros.: [Israeli supplement](https://foro.spinecard.com/t/1683/2) shows European Version on the front, a Hebrew sticker, ISR flaps and a manual cover marked `NES-SM-ISR`. This is a counter-comparison, not an Israeli reassignment of the existing PAL catalog entry. The English heading does not prove the manual's interior language.

## Deliberately pending

- Popeye fourth-print booklet/asterisk assertion in [post 50](https://foro.spinecard.com/t/1683/50) is reported from others without the requested edition's photographs. The SPACO manual photo is not proof of that specific printing.
- The table's Zelda Small Box `NESE-P-ZL` and Zelda II Small Box `NESE-P-AL` are research leads only, pending component photographs. They never enter the vision prompt.
- Five-print chronology, all seal combinations, localization dates/stock motives, exhaustive regional availability, adapters inside cartridges, and rarity remain unverified. Absence from a collection does not prove nonexistence.
- The table includes To the Earth dated 1990, whereas the introduction describes a 1986-1989 interval. No dates are imported into the catalog. No stars of rarity become current prices or scarcity grades.

## Integration boundary

Eight general inspection rules; eight per-game records: five usable comparison guides for five explicit PAL IDs, three pending records. Seven distinct IDs including pending Zelda entries.

Usable IDs: `nes-pal-eu-mike-tyson-s-punch-out`, `nes-pal-popeye`, `nes-gumshoe`, `nes-athletic-world`, `nes-pal-eu-super-mario-bros`.

The existing documentary loader adds NES to its explicit platform map. General rules remain NES-only; per-game guidance uses exact `catalog_id`, never title matching. A generic PAL record is not converted into Small Box, Israeli, SPACO, or any printing by this binding. Other regions, reissues, rentals, packs and Famicom do not inherit per-game references.

No acceptance thresholds, deterministic packaging rules, human decisions, approved examples, search queries or price writing changed. No real eBay batch or OpenAI call was launched. This is prompt guidance, not fine-tuning or measured accuracy improvement. When integrated, its text can increase future token usage; it does not add a separate API call. Existing research-aware cache keys already invalidate changed guidance.

## Verification

- `python3 scripts/test_region_research.py`: 31/31 offline; five new NES tests, plus NES included in traceability/bounded-prompt tests.
- `python3 scripts/test_collector_intelligence.py`: PASS.
- `python3 scripts/test_wallapop_evidence.py`: PASS.
- `python3 scripts/test_ai_balance_pause.py`: 3/3; balance warnings and tokens are simulated.
- Maximum NES prompt: 2,994 characters in this snapshot, not measured billed tokens.
- `git diff --check`: PASS.
- `data/catalog.json`, `data/index/companies.json`, `data/meta.json`, `data/game-details.json`, `regional_packaging.py` and `game_region_learning.py`: same blobs as base `5bdea9d983506f3e413639424bc434a88a77e603`.
- Local snapshot retains 73,104 rows and unique IDs. Historical verification, not a permanent numeric constraint or a current Production read. Prices, credits, URLs, covers and identities untouched.
- No local application build for this documentary/Python extension. Remote Quality/Preview status must be checked against the pushed SHA, not inherited from the earlier green SNES commit.

This pass changes only NES JSON, the loader platform map, focused tests and this report. Prior platform documents are unchanged. PR #208 remains DRAFT without merge or Production; preserve its unmerged worktree.
