# RegionAtlas Research Engine — V2

## Goal

Build a research-only subsystem that walks the RegionAtlas catalog, detects research debt, opens evidence-driven tasks and delegates tightly scoped investigation to interchangeable search, fetch/browser, vision and LLM adapters.

V2 **does not mutate catalog data**, **does not merge anything automatically** and treats an honest `UNRESOLVED` result as preferable to a wrong high-confidence claim.

## Pipeline

```text
Catalog + physical guides + owned scans
        ↓
Catalog context builder
        ↓
Knowledge loader (general + platform + legacy scanner)
        ↓
Deterministic Research Router
        ↓
Field-specific source ranking + predefined queries
        ↓
Search → bounded fetch → browser fallback → image search
        ↓
Cheap structured extraction / vision
        ↓
Field-level claims + subject/component-bound evidence
        ↓
Validators + conflict preservation + dynamic replanning
        ↓
Durable local state + auditable artifacts
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

## V2 runtime boundaries

The runtime separates these interfaces:

```ts
ResearchSearchProviderV2
ResearchPageFetcher
ResearchBrowserProvider
ResearchImageSearchProvider
ResearchVisionProvider
ResearchLlmProvider
ResearchRunStore
```

Search uses Brave Search and Brave Images as the validated primary providers; the existing fallback adapters remain available when explicitly configured. Direct fetches are bounded and SSRF-protected. Playwright is used only as a permitted fallback. OpenAI text and vision models are configurable and must return strict structured output.

Set `RESEARCH_DISABLE_SERPAPI=1` when a retained SerpAPI credential is intentionally unavailable or invalid. Authentication failures are classified separately, open that provider's circuit immediately and never trigger technical retries.

The catalog/domain layer must not know which provider is used.

The loop is:

```text
1. read task
2. load current RegionAtlas context and knowledge
3. ask a closed-choice rule when applicable
4. route a single target field to capable sources
5. search, fetch and inspect exact components
6. validate and bind every claim
7. replan when a new identifier appears
8. stop `CONFIRMED`, `PARTIAL` or `UNRESOLVED`
```

Never force a national market when evidence only supports `UNKNOWN_EU` or similar.

## CLI

Copy `.env.worker.example` to `.env.worker`, set `RESEARCH_ENGINE_ENABLED=1`, configure at least one search provider plus `OPENAI_API_KEY`, then use:

```bash
npm run research:scan
npm run research:queue
npm run research:run -- --task <task-id>
npm run research:resume -- --run <run-id>
```

Filter by platform:

```bash
npm run research:scan -- --platform ps5
```

Filter by title/edition/barcode/identifier:

```bash
npm run research:scan -- --query "Assassin's Creed"
```

Write the scan artifact:

```bash
npm run research:scan -- --query "Assassin's Creed" --write
```

Return the complete flagged queue:

```bash
npm run research:scan -- --limit all --write
```

Run the sequential five-case Assassin's Creed pilot with:

```bash
npm run research:pilot:assassins-creed -- --case 1
npm run research:pilot:assassins-creed -- --all
npm run research:pilot:assassins-creed -- --report
npm run research:golden
```

Pilot 4 exercises the physical-evidence pipeline. Discovery is the mandatory first gate; the full five-case run is allowed only after that gate demonstrates a component-bound identifier with no unrecovered technical failure.

```bash
npm run research:pilot:assassins-creed:v4 -- --case 2
npm run research:pilot:assassins-creed:v4 -- --all
npm run research:pilot:assassins-creed:v4 -- --report
```

Run artifacts live under `artifacts/research-engine/runs/<run-id>/`. Pilot case artifacts live directly under `artifacts/research-engine/pilot-assassins-creed/<case-id>/`, with a global `closure.md`.

The queue and state are JSON documents on local disk and survive process or machine restarts. A resumed run reloads prior artifacts and skips every normalized query and visited URL already recorded.

## Knowledge boundary

- `data/research-engine/knowledge/` contains general rules, source capabilities, query templates, playbooks and platform packs.
- `data/research-engine/knowledge/platforms/n64.json` is the frozen N64 v1 pack.
- `data/region-research/` is adapted as component-bound documentary guidance. `reviewed_guidance` can route research; candidates stay discovery-only. Neither becomes an automatic answer.
- `data/research/golden/` is evaluation-only and is deliberately excluded from the runtime knowledge loader.

## Physical evidence binding

When the remaining gap requires a photograph, the router enters `PHYSICAL_EVIDENCE_MODE`. It first opens source galleries, resolves original images from thumbnails and embedded metadata, and deduplicates image bytes before spending vision calls. Generic search is capped after this transition.

Vision is staged and fail-closed:

```text
subject identity (low detail)
        ↓ exact product only
component identity (low detail)
        ↓ known component only
identifier/text extraction (high detail)
        ↓ deterministic validation
product + component binding
```

Collector and bundle evidence additionally requires a literal visible edition marker before `EXACT_PRODUCT` is eligible. A matching title on a Standard, Skull, Buccaneer, Black Chest, Special or Double Pack image is not interchangeable.

The product graph keeps physical product, outer package, inner product, media, document, sticker and accessory nodes distinct. Identifier bindings therefore record both a product node and component node. An outer-package barcode cannot corroborate an inner game barcode, and a seller sticker is never treated as printed package evidence.

Physical acquisition and binding are auditable through the case artifacts: source/gallery pages, image resolution provenance, staged classifications, vision extractions, identifier candidates/rejections, product graph, market binding, evidence gaps, fallback events and component-binding metrics.

## Cost and model policy

`RESEARCH_LLM_MODEL` and `RESEARCH_VISION_MODEL` choose the cheap structured-output models. `RESEARCH_MAX_COST_USD` caps each run. Search, pages, images, browser sessions, LLM/vision calls, tokens, model usage and estimated model cost are persisted. `RESEARCH_STRONG_MODEL` is reserved for a future exceptional-conflict tier and is not required by the pilot.

When two accessible candidates are configured in `RESEARCH_BENCHMARK_MODELS`, `npm run research:benchmark` compares barcode, identifier, language, cross-attribution, false-certainty and cost metrics. Component accuracy is added when `RESEARCH_BENCHMARK_IMAGE_URL` and its expected component are supplied; otherwise it is reported as unavailable, never invented.

Default budgets are P0 `20/30/20/12`, P1 `12/20/12/8`, and P2 `6/10/6/4` for searches/pages/images/agent turns, plus token, cost and browser limits.

## Safety boundary

This foundation is intentionally **research-only**:

- no catalog mutation;
- no automatic merges;
- no automatic deletions;
- no automatic digital↔physical reclassification;
- no automatic regional reassignment;
- no automatic PR merge.

The future patch-builder should only generate candidate changes. High-risk operations remain review-gated until a large golden set demonstrates sufficient precision.

## Future stages

1. Optional stronger-model conflict escalation after benchmark evidence.
2. Server scheduler replacing the manual CLI without changing engine modules.
3. Review UI for source candidates and research proposals.
4. Candidate patch builder behind explicit human review; no auto-apply is enabled.
