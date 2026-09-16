# Existing pipeline audit

## Reused pipeline

- `collect_ebay_es.py` already retrieves eBay listings, rejects auctions, separates physical editions and routes regional variants.
- `region_cover_vision.py` already emits component-level observations and condition evidence.
- `price_review_queue.py` already persists unresolved candidates and historical decisions.
- Research Engine V2 already provides subject binding, product graphs, evidence gaps and physical-source routing.
- `sync_es_prices.py` remains the only route from accepted observations to aggregation, minimum-observation checks, regional rules, condition buckets, outliers and history.

## Data present before this bridge

The collector row and queue preserved listing ID/URL/query, price, images, title, candidate IDs, match alternatives, regional evidence/confidence, condition and expected contents. The PC review job could also store `evidence.coverVision.observations`.

## Demonstrated loss

The inline eBay vision path returned only `(region, evidence, confidence, verified, condition)`. Its component observations were discarded before `to_ingest_listing`, so new eBay review items did not reliably receive `imageIndex`, component/role, text snippets, product codes, barcodes, languages, ratings, distributors or edition markers.

The bridge adds an optional result sink without changing the existing return tuple, attaches the complete result to collector rows, preserves it in queue evidence and serializes a versioned bundle. Existing callers remain compatible.

## Authority boundary

Shadow/holdout output is derived only. Accepted or rerouted decisions are represented as normal listing observations; direct catalog-price patches are not used. Stale hashes abort application with `STALE_REVIEW_INPUT`. New variants remain proposals.
