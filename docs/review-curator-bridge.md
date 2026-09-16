# eBay Review Curator bridge

The bridge connects the existing eBay collector, price review queue and Research Engine V2 without replacing any of them.

## Data flow

```text
collect_ebay_es.py
  -> region_cover_vision component observations
  -> price_review_queue (evidence preserved)
  -> PhysicalEvidenceBundleV1
  -> review-curator (reuse bundle, then create gap-scoped Research Engine tasks)
  -> structured decision
  -> accepted/rerouted observation JSON
  -> normal sync_es_prices aggregation and outlier pipeline
```

The neutral contract is `data/schemas/physical-evidence-bundle-v1.schema.json`. Python serializes it in `scripts/collectors/physical_evidence_bundle.py`; TypeScript validates and consumes it in `src/lib/review-curator.ts`.

The bridge maps only proven component roles. In particular, the worker's generic `box` component maps to `UNKNOWN_COMPONENT`, not automatically to an outer collector package or inner case.

## Safety model

Defaults are fail-closed:

```dotenv
CURATOR_ENABLED=0
CURATOR_SHADOW=1
CURATOR_APPLY_EXISTING_DECISIONS=0
CURATOR_ALLOW_CATALOG_MUTATIONS=0
CURATOR_ALLOW_AUTOMERGE=0
```

`--shadow` only writes run artifacts. `--apply-decisions` requires explicit enablement, rereads the queue, verifies item and evidence hashes, retains decision history and emits accepted observations for normal price ingestion. It never edits catalog or price fields. `PROPOSE_NEW_VARIANT` remains a proposal.

`--authoritative --shadow` reads the live worker queue through the existing authoritative read path (HTTP, then SFTP) and cannot be combined with apply or holdout mode. A failed authoritative read aborts; it never silently substitutes the bundled queue.

`--limit` limits complete game/listing cases, not internal research steps. The Curator only stops between cases: once a game has started, its evidence-gap research and resolution finish before the run can end. If the eligible batch contains fewer cases than the limit, the run closes normally with that smaller complete batch.

Evidence in Spanish, PEGI, an EU barcode, a Spanish seller or a Spanish storefront is not sufficient market proof. Automatic existing-catalog decisions require `MARKET_BOUND`; `LANGUAGE_ONLY` defers.

## Future platform modes

- `MAINTENANCE`: the collector feeds prices continuously; non-matching evidence becomes a `DISCOVERY_EXCEPTION` for the queue and Curator.
- `DISCOVERY`: the same collector can surface price observations plus proposed regional/physical variants. Proposals still require a separate reviewed catalog workflow.

No platform is automatically marked complete or switched between these modes by this phase.
