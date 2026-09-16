## Summary

Stacked on #285 (`codex/research-engine-physical-evidence-binding`). This PR connects the existing eBay collector and review queue to a fail-closed Curator boundary without replacing the worker or bypassing the normal price pipeline.

- preserves full `region_cover_vision` component observations into review items;
- adds the versioned, cross-language `PhysicalEvidenceBundleV1` contract;
- adds gap-scoped Research Engine tasks and structured curator resolutions;
- protects stale inputs, idempotency, history, defer backoff and complete-game run boundaries;
- sends accepted/rerouted observations back through normal price ingestion;
- keeps new variants as proposals and all catalog/automerge flags disabled.

## Validation evidence

Historical blinded replay was limited to the 11 auditable human-reviewed eBay rows available, rather than the preferred 30. It produced 3 correct rejects and 8 defers, with zero critical false accepts. Because true pre-decision snapshots and positive ACCEPT/REROUTE validation are unavailable, autonomous existing-catalog resolution remains **NOT READY**.

The authoritative shadow read processed 20 complete pending cases: 0 accept, 0 reroute, 7 reject, 13 defer, 0 proposed variants. Brave requests: 0. OpenAI calls: 0. Cost: $0. Catalog, price and authoritative queue mutations: 0.

Artifacts are under `artifacts/review-curator/`.

## Checks

- `npm run test:review-curator`
- `npm run typecheck`
- `npm run lint` (0 errors; existing warnings only)
- `npm run test:research-engine`
- `npm run test:collector-controls`
- `npm run test:market-enrichment`
- `npx tsx --test src/lib/admin-price-review.test.ts`
- `npm run build`

This PR intentionally remains Draft. No merge, automerge, catalog mutation, price mutation or autonomous publication is enabled.
