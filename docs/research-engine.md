# RegionAtlas Research Engine — Foundation

## Goal

Build a research-only subsystem that can walk the RegionAtlas catalog, detect research debt, open evidence-driven tasks, and later delegate web investigation to a search/browser/LLM adapter without coupling catalog logic to a single provider.

The first version **does not mutate catalog data** and **does not merge anything automatically**.

## Pipeline

```text
Catalog + documented physical guides
        ↓
Catalog scanner
        ↓
Risk detector / research debt
        ↓
P0 / P1 / P2 task queue
        ↓
Query planner
        ↓
Search provider adapter
        ↓
Research agent adapter
        ↓
Claims + evidence
        ↓
Claim reducer / conflict detection
        ↓
Candidate patch (future)
        ↓
QA + DRAFT PR (future)
```

## Current modules

- `types.ts` — domain model for subjects, risks, tasks, evidence, claims and scan results.
- `platform-identifiers.ts` — deterministic guard against cross-platform serial contamination.
- `source-policy.ts` — source capability and authority policy. A source can support one field without proving another.
- `task-planner.ts` — converts catalog risks into research questions and P0/P1/P2 debt.
- `query-planner.ts` — generates initial and task-specific search queries, branching from barcode/product code when available.
- `catalog-scanner.ts` — scans public catalog entries plus documented physical editions and builds a prioritized research queue.
- `reducer.ts` — resolves corroborated field-level claims or leaves explicit conflicts/unresolved states.
- `engine.ts` — provider/agent orchestration boundary for future online research.

## Research debt

### P0 — possible catalog correctness error

Examples:

- platform identifier contamination (`BLES` on Xbox 360);
- download-code product counted as disc;
- canceled physical release counted as released;
- case-only SteelBook counted as a game edition;
- physical/digital status conflict.

### P1 — important research gap

Examples:

- missing barcode;
- physical box exists but national market is unresolved;
- weak or missing evidence;
- pending physical identifier;
- unconfirmed regional variant.

### P2 — enrichment

Examples:

- packaging language not yet proven;
- catalog entry pending editorial review.

P2 items must never be force-resolved merely to reach zero research debt.

## Field-level evidence

The engine deliberately does not use a single `confidence` score for a whole record.

A retailer may prove:

- a barcode;
- sale/circulation in a market;
- edition naming;

but does **not automatically prove packaging language**.

A physical back-cover scan can prove packaging language and barcode, while Redump/SerialStation/DBox are stronger for disc/product-code/software-language claims.

This is encoded by `source-policy.ts` and later adapters should preserve that distinction.

## Online research integration

The foundation exposes two interfaces:

```ts
ResearchSearchProvider
ResearchAgentAdapter
```

A future provider can be backed by Google/Bing/SerpAPI/browser search. A future agent can use an LLM with browsing/vision.

The catalog/domain layer must not know which provider is used.

The expected online loop is:

```text
1. read task
2. generate initial queries
3. search
4. inspect evidence
5. extract field-level claims
6. detect contradictions
7. generate follow-up queries
8. stop CONFIRMED or UNRESOLVED
```

Never force a national market when evidence only supports `UNKNOWN_EU` or similar.

## CLI

Run a research-only catalog scan:

```bash
npx tsx scripts/research-engine-scan.ts
```

Filter by platform:

```bash
npx tsx scripts/research-engine-scan.ts --platform ps5
```

Filter by title/edition/barcode/identifier:

```bash
npx tsx scripts/research-engine-scan.ts --query "Assassin's Creed"
```

Write the scan artifact:

```bash
npx tsx scripts/research-engine-scan.ts --query "Assassin's Creed" --write
```

Return the complete flagged queue:

```bash
npx tsx scripts/research-engine-scan.ts --limit all --write
```

Artifacts are written under `artifacts/research-engine/` only when `--write` is passed.

## Safety boundary

This foundation is intentionally **research-only**:

- no catalog mutation;
- no automatic merges;
- no automatic deletions;
- no automatic digital↔physical reclassification;
- no automatic regional reassignment;
- no automatic PR merge.

The future patch-builder should only generate candidate changes. High-risk operations remain review-gated until a large golden set demonstrates sufficient precision.

## Next implementation stages

1. Durable research queue/store using the existing JSON/blob storage utilities.
2. Search provider adapter with domain-aware source routing.
3. Browser fetch adapter for retailer/technical pages.
4. LLM research adapter with follow-up query generation.
5. Vision adapter for front/back/spine/barcode evidence.
6. Claim provenance persisted per field.
7. Candidate patch builder.
8. Golden-set certification using the Assassin's Creed audits as regression fixtures.
9. Admin dashboard for queue, conflicts and research debt.
10. Controlled auto-apply for low-risk additions only (e.g. corroborated identifiers/sources), never merges/deletions by default.
