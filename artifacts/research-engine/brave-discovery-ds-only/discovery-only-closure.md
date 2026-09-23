# Discovery DS Spain — Brave-only pilot closure

Final run: 2026-09-16

## Scope

Only `case-2-ac2-discovery-ds-spain` was executed. The four other Assassin's Creed pilot cases were not run in this namespace. This was a fresh semantic run and did not reuse prior final evidence as an answer source.

## Configuration

- Brave Search: configured and operational.
- Brave Images: configured and operational.
- Google Custom Search: not configured.
- SerpAPI: explicitly disabled locally because the retained credential is invalid/unavailable.
- Research mode: read-only.
- Catalog mutations: 0.

The run exposed an invalid SerpAPI fallback before the final validation. Provider authentication failures are now classified as `PROVIDER_AUTHENTICATION_FAILED`, open the provider circuit immediately, and can be excluded with `RESEARCH_DISABLE_SERPAPI=1`. The final run made zero SerpAPI calls.

## Final pilot result

- Status: `PARTIAL`.
- Gate: `PASS — PHYSICAL_PIPELINE_DEMONSTRATED`.
- Queries: 20.
- Brave web queries: 18.
- Brave image queries: 2.
- Search results retained: 31.
- Source pages opened: 8.
- Useful pages: 4.
- Gallery pages opened: 5.
- Image candidates discovered: 308.
- Full-resolution images fetched: 1.
- Images inspected: 2.
- Exact-target images: 2.
- Component-bound claims: 1.
- Product-bound identifiers: 1.
- Technical failures: 9 recovered, 0 unrecovered.
- Brave search/provider errors: 0.
- Fallback events: 0.
- Catalog mutations: 0.

## Evidence result

The worker found and inspected an exact LaunchBox back-cover image. It extracted a barcode and bound it to `OUTER_PACKAGE_BACK` for the exact product. This is externally auditable component evidence, but competing EAN records remain and no independent Spanish-market binding was found.

- Barcode: `CONFLICT`; one exact product-bound visual candidate remains under review.
- Box code: `CONFLICT`; database candidates are not component-bound strongly enough.
- Cartridge/product code: `UNRESOLVED`; no readable exact cartridge code was obtained.
- Spanish market: not confirmed. Packaging language or a European identifier was not promoted to Spanish distribution evidence.

## Candidate interpretation

- Candidate subject: 1 existing RegionAtlas subject.
- Confirmed Spanish missing editions: 0.
- Strong Spanish candidates: 0.
- Possible / needs-more-evidence: 1.
- Product-bound identifier candidates: 1.
- Rejected claims: 2.
- Already-existing catalog subject: 1.
- Recommended action: `NEEDS_MORE_EVIDENCE`.

No `ADD_CANDIDATE` action was executed.

## Cost

Final pilot case:

- Brave: $0.100000.
- OpenAI: $0.011766.
- Case total: $0.111766.
- Brave preflight: $0.005000.
- Final run total: $0.116766.

Whole task, including controlled validation and two diagnostic reruns used to reproduce and verify the SerpAPI routing defect:

- Brave requests: 68 total; 60 web and 8 image.
- Estimated Brave cost: $0.340000.
- Estimated OpenAI cost: $0.036934.
- Estimated combined cost: $0.376934.

## Limitations

- General Brave queries are noisy and often return accessories or low-authority commerce pages.
- Exact-title and image queries were substantially more useful.
- eBay blocked nine direct/browser page attempts with HTTP 403; all were recovered without failing the pilot.
- The remaining research gap is a second authoritative Spanish specimen plus a readable cartridge image.
- The generated five-case aggregate closure reports `retrievalPass: false` because four cases were intentionally not run. For this single-case order, the relevant gate is `gate-1-result.json`, which passed.

## Final state

- PR remains Draft.
- No merge or automerge.
- Catalog unchanged.
- Other Discovery cases not executed.
