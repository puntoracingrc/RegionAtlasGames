# Assassin's Creed research pilot closure

- case-1-black-flag-resynced-ps5: CONFIRMED
- case-2-ac2-discovery-ds-spain: UNRESOLVED
- case-3-ac4-skull-wiiu-spain: UNRESOLVED
- case-4-ezio-collection-switch: UNRESOLVED
- case-5-brotherhood-revelations-double-pack-xbox360: UNRESOLVED

- Cases: 5 (5 completed)
- Confirmed: 1
- Partial: 0
- Unresolved: 4
- Failed: 0
- Blocked infrastructure: 0
- Retrieval pass: PASS
- Functional validation: FAIL
- Unsafe false positives: 0
- Cross-attribution errors accepted: 0
- Platform contamination errors accepted: 0
- Search calls: 88
- Generic queries: 9
- Exact-identifier queries: 31
- Source-specific queries: 39
- Image queries: 9
- Brave web calls: 79
- Brave image calls: 8
- Pages: 27
- Images: 9
- LLM calls: 27
- Vision calls: 9
- Input tokens: 154077
- Output tokens: 4696
- Estimated OpenAI cost: $0.025930
- Estimated Brave cost: $0.435000
- Preflight cost: $0.005000
- Case cost: $0.460930
- Estimated total cost: $0.465930
- Technical failures recovered: 16
- Technical failures unrecovered: 0
- Duration: 284729 ms
- Catalog mutations: 0

## Case conclusions

### Case 1 — Black Flag Resynced PS5

`CONFIRMED`. The positive control resolved again through independent Ubisoft and GameFAQs evidence. The measured case used eight exact-identifier queries followed by six source-specific queries. No image inspection was needed.

### Case 2 — Discovery DS Spain

`UNRESOLVED` in the measured run. The worker found several checksum-valid barcode candidates, but the strongest value scored `0.684` and remained in a real conflict. The Retroplace multi-version page and an aggregate eBay page did not bind one value to the exact Spanish physical component. Box code and cart/product code remained without eligible evidence. The missing proof is an exact Spanish back cover/box flap plus an exact EUR/Spanish cart label or technical record.

### Case 3 — Skull Edition Wii U Spain

`UNRESOLVED`. The edition-first query was over-constrained as one quoted phrase containing both edition and market, and the per-target source budget was spent before a useful Wii U Skull specimen page opened. Two images were inspected but neither produced eligible Skull-specific evidence. The missing proof remains a Wii U Skull outer-package photo and a separate inner-case/component reading.

### Case 4 — Ezio Collection Switch

`UNRESOLVED`. Ubisoft proved the Switch release and its software contents, not how those contents are distributed on the physical product. DoesItPlay returned PS4/other-game pages through related-link text; those claims were rejected. Image search inspected cartridge/digital-cover candidates but no readable back-cover download/code statement. The missing proof is an exact Switch back cover or unboxing that shows the cart, inserts, and download/code wording.

### Case 5 — Brotherhood + Revelations Double Pack Xbox 360

`UNRESOLVED`. Exact-EAN routing reduced cost and found the Retroplace compilation record plus a Spanish product page, but no observed barcode was bound to `OUTER_PRODUCT` or a named `INNER_GAME`. Free-form `INNER`/`INCLUDES` claims were rejected. The missing proof is a photo sequence showing the outer compilation barcode and each inner product separately.

## Post-run bounded corrections

The measured result above is not rewritten. Its evidence exposed three deterministic defects which were then covered in code/tests: candidate claims now enter identifier replanning, exact-identifier work is capped before source corroboration, and collector/source queries are interleaved by source breadth with platform-correct hosts. Image ranking now favors back covers, carts, and component photos. These refinements were not presented as a second full Pilot 3 because doing so would have exceeded the phase's cost-control intent.

## Cost and decision

- Final comparable Pilot 3 snapshot: `$0.465930` including the `$0.005000` Brave preflight.
- Accumulated recorded cost including the replaced positive-control attempt and its extra Brave preflight: `$0.563106`.
- Success threshold: not met (`1 CONFIRMED`, `0 PARTIAL`, `4 UNRESOLVED`).
- Next bottleneck: component-bound physical evidence selection, not retrieval infrastructure.

RETRIEVAL: VALIDATED

RESEARCH QUALITY: FAIL

FUNCTIONAL AUTONOMOUS RESEARCH: NOT YET VALIDATED

CATALOG MUTATIONS: 0

FALSE POSITIVES: 0

PLATFORM CONTAMINATION: 0

PR #281: DRAFT
