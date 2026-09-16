# Listing image funnel

The eBay HTML listing page is not used as the primary acquisition route. Exact items are hydrated with the official Browse API.

## Global funnel

- listings selected: 20
- listings hydrated: 20
- listings with image URLs: 20
- total gallery images: 126
- unique images preserved by content hash: 126
- original-resolution images: 126
- photos triaged: 126
- subject accepted: 74
- component classified: 71
- high-detail inspected: 68
- component-bound observations: 67
- market-bound observations: 38
- resolved cases: 5

## Loss audit

The previous funnel stored search-summary image URLs in the collector row, then the shared listing helper defaulted to three images. The review queue and PhysicalEvidenceBundle inherited only that truncated list and carried no content hash, dimensions, exact-item snapshot, or immutable listing/image/component binding.

### Exact legacy trace: `v1|377370832247|0`

This listing was followed through the committed PR #288 evidence. The exact-item API was re-read on 2026-09-16; the listing HTML was not used.

| Stage | Image references | Unique physical photos | Resolution/provenance | What happened |
|---|---:|---:|---|---|
| eBay Browse `GET item/{item_id}` | 3 | 3 | All 1200×1600; official exact-item response | The complete API gallery was available. |
| collector search row | 4 | 3 | One 1600 URL, three 225 URLs; same primary photo appears twice | Search-summary variants were stored without normalization or content hashes. |
| ingest | not independently persisted | not independently auditable | No raw pre-queue snapshot exists | The boundary could not be reconstructed without assuming it matched the queue row. |
| review queue | 4 | 3 | Same one 1600 + three 225 references | No additional loss in count, but two unique photos remained thumbnail-only. |
| `PhysicalEvidenceBundleV1` | 4 | 3 | Width/height absent; all hashes `null`; components absent | Duplicate resolution variants were treated as separate images. |
| Stage A | 4 carried, 0 used | 3 carried | `imagesUsed=[]`, `observations=[]` | The bundle was consulted as URL references, not component-bound physical evidence. |
| Deep Curator | 4 carried, 0 inspected | 3 carried | Exact listing browser access returned HTTP 403 | It retried the listing page instead of hydrating the exact item through Browse API. |

Exact API gallery URLs:

- `https://i.ebayimg.com/images/g/IpQAAeSwqn9qjtNW/s-l1600.jpg`
- `https://i.ebayimg.com/images/g/o5AAAeSw0DZqjtNW/s-l1600.jpg`
- `https://i.ebayimg.com/images/g/kKMAAeSw0zlqjtNW/s-l1600.jpg`

Legacy collector/queue URLs:

- `https://i.ebayimg.com/images/g/IpQAAeSwqn9qjtNW/s-l225.jpg`
- `https://i.ebayimg.com/images/g/IpQAAeSwqn9qjtNW/s-l1600.jpg`
- `https://i.ebayimg.com/images/g/o5AAAeSw0DZqjtNW/s-l225.jpg`
- `https://i.ebayimg.com/images/g/kKMAAeSw0zlqjtNW/s-l225.jpg`

The measurable loss was therefore not simply “four became three”. It was loss of exact-item hydration, original resolution for two unique photos, deduplication, dimensions, content hashes, component labels, and actual high-detail inspection. V2 repairs those boundaries and makes the unpersisted legacy ingest boundary explicit instead of inventing evidence.

V2 hydrates the exact item first, retains up to 24 API-returned gallery records, downloads them only into the ignored internal evidence cache, deduplicates by SHA-256, and passes listingId + imageIndex + contentHash + component into every observation. Images remain non-public evidence references.

| Case | Platform | API photos | Preserved | Original | Classified | High detail | Bound observations | Diagnosis |
|---|---|---:|---:|---:|---:|---:|---:|---|
| ps5-biomutant | ps5 | 3 | 3 | 3 | 3 | 3 | 3 | MARKET_BINDING_FAILURE |
| ps4-hoa | ps4 | 7 | 7 | 7 | 7 | 1 | 1 | MARKET_BINDING_FAILURE |
| ps5-hoa | ps5 | 7 | 7 | 7 | 7 | 1 | 1 | MARKET_BINDING_FAILURE |
| ps4-horizon-zero-dawn | ps4 | 3 | 3 | 3 | 3 | 2 | 1 | MARKET_BINDING_FAILURE |
| gameboy-74f1b486ba2398b1d771 | gameboy | 3 | 3 | 3 | 3 | 0 | 0 | SUBJECT_CLASSIFICATION_FAILURE |
| n64-super-mario-64 | n64 | 14 | 14 | 14 | 14 | 8 | 8 | TRULY_MISSING_EVIDENCE |
| gameboy-3e5cf57f4a78743f4a89 | gameboy | 3 | 3 | 3 | 3 | 3 | 3 | MARKET_BINDING_FAILURE |
| ps4-horizon-forbidden-west | ps4 | 6 | 6 | 6 | 6 | 6 | 6 | MARKET_BINDING_FAILURE |
| n64-diddy-kong-racing | n64 | 8 | 8 | 8 | 8 | 8 | 8 | TRULY_MISSING_EVIDENCE |
| ps5-ikai | ps5 | 12 | 12 | 12 | 12 | 1 | 1 | MARKET_BINDING_FAILURE |
| ps4-god-eater-3 | ps4 | 4 | 4 | 4 | 4 | 2 | 2 | MARKET_BINDING_FAILURE |
| ps5-tales-of-arise | ps5 | 3 | 3 | 3 | 3 | 3 | 3 | MARKET_BINDING_FAILURE |
| n64-pokemon-snap | n64 | 3 | 3 | 3 | 3 | 3 | 3 | TRULY_MISSING_EVIDENCE |
| ps4-gran-turismo-7 | ps4 | 12 | 12 | 12 | 12 | 1 | 1 | MARKET_BINDING_FAILURE |
| gameboy-d7f572a1f0c11eea4e20 | gameboy | 3 | 3 | 3 | 3 | 2 | 2 | TRULY_MISSING_EVIDENCE |
| gameboy-2e7645bc3a0305d6661c | gameboy | 7 | 7 | 7 | 7 | 7 | 7 | MARKET_BINDING_FAILURE |
| ps5-bramble-the-mountain-king | ps5 | 6 | 6 | 6 | 6 | 1 | 1 | MARKET_BINDING_FAILURE |
| n64-mario-kart-64 | n64 | 4 | 4 | 4 | 4 | 0 | 0 | SUBJECT_CLASSIFICATION_FAILURE |
| n64-mario-party | n64 | 14 | 14 | 14 | 14 | 12 | 12 | TRULY_MISSING_EVIDENCE |
| gameboy-2a15931917249023d109 | gameboy | 4 | 4 | 4 | 4 | 4 | 4 | TRULY_MISSING_EVIDENCE |
