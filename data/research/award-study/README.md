# Award research V1: foundation in progress

This is an initial implementation milestone, not the completed AWARDS-PERSONS-V1 release.
No results, series or editorial approvals are published yet. No public route imports this
layer yet. Existing people, company and game pages remain unchanged.

## Files and reproducibility

- `research.json`: internal typed research; related records are co-located so validation
  is atomic. Recipients are embedded in results. Work, person-work and company-work
  decisions are explicit, independently approvable rows.
- `../award-editorial-approvals.json`: approved kind/ID pairs pinned to the exact SHA-256
  of the research file. A changed research file invalidates existing approvals.
- `public.json`, `manifest.json`, `review.json`: generated outputs. Do not edit manually.
- `public.json` is the only award JSON the public query library imports.

Run from the repository root:

```sh
npm run awards:build
npm run awards:check
npm run test:awards
```

The TypeScript builder uses the real `getCatalogWorkKey`; it does not implement a second
normalizer or work identity system. It validates the complete input before writing any
output. Empty research is intentional at this milestone: test fixtures are synthetic,
not publishable historical evidence.

## Publication rules

- Unique series, editions, categories, results, recipient facts and link decisions.
- Results need an approved dependency chain, explicit recipients, high confidence,
  verification and primary evidence. Wikidata alone cannot publish them.
- Unknown persons may be named with a null public slug; this never creates a route.
- Exact public person credits only; contextual associations do not create work awards.
- Company work credits require an explicit role and audited catalog/work identity.
  No automatic inheritance, aliases, parent-company or acquisition propagation.
- Existing personal recognitions remain in their original dataset. Only a public formal
  result with the same personal recipient may replace its display via a legacy link.
- No pricing, collection, cover, company, person or catalog mutation.

## Pending implementation

1. Complete source-backed research and audit the relevant work identities.
2. Populate the seven series, recent results and historical archive.
3. Independently review work/person/company bridges and legacy recognition links.
4. Integrate the UI, routes, metadata, sitemap and navigation.
5. Complete route-level privacy checks, full acceptance tests and desktop/mobile QA.

The baseline inventory is in `docs/research/awards-persons-v1/baseline.json`.
It is an audit artifact, never a production publication input. Historical counts in
that report are not permanent constraints on catalog growth.
