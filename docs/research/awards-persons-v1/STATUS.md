# AWARDS-PERSONS-V1: IN PROGRESS

Base: `2f4abf82a229a8afe59a3212bdc0e2643d984028`.

User specification: `REGIONATLAS_CODEX_IMPLEMENTACION_PREMIOS_PERSONAS_V1.md`,
SHA-256 `9346ebb93788d03e1c41f450e5eb0c98b88ece2b2ef153ae62d03e873f5e85a0`.

This report does not declare the V1 acceptance criteria complete. No merge or Production
release is included in this milestone. No public awards page has been built yet.

## Baseline and audit

- 73,104 catalog rows and unique IDs; 4,481 company index entries.
- 488 existing people: 25 public, 302 structured/Admin-only, 161 blocked.
- 364 existing personal award records, 31 currently public.
- 63 public exact credits. No changes to person publication gates.
- Priority public people: Hidetaka Miyazaki, Hideo Kojima, Shigeru Miyamoto.
- Priority internal people: Sam Lake, Neil Druckmann, Todd Howard, Josef Fares,
  Eric Barone, Naoki Yoshida.
- Swen Vincke and Guillaume Broche: no exact identity/name/alias found in the current
  person core. No records have been created or merged.
- Baldur's Gate III has four title candidates; the Roman-numeral spelling is accounted
  for only in this report. No title matching can publish a work relationship.
- Elden Ring's 35 title candidates include separate works and expansions. Every
  candidate remains unapproved; no candidate list has been turned into a work mapping.
- No title candidates were found for Vampire Survivors, Betrayal at Club Low, Venba,
  Consume Me and Titanium Court. This is a search result, not proof of catalog absence.

`baseline.json` preserves the complete priority-person inventory, legacy award
classification proposals, work candidates, existing company role indexes, catalog-ID
and URL digests, and protected data SHA-256 hashes. Company indexes and inherited
person source URLs are candidates for review, not new verified evidence.

Reproduce without changing application data:

```sh
npx tsx scripts/audit-awards-baseline.ts --check
git diff --exit-code 2f4abf82a229a8afe59a3212bdc0e2643d984028 -- data/catalog.json data/meta.json data/game-details.json data/index/companies.json data/index/company-entities.json data/index/catalog-work-identities.json data/research/person-study data/research/person-editorial-approvals.json data/research/company-study
```

The audit check is not wired to global tests. Its historical counts must not block
legitimate future catalog changes.

## Implemented foundation

- Typed file-backed award domain and deterministic TypeScript builder.
- Research-hash-pinned editorial allowlist and fail-closed publication dependencies.
- Formal recipients distinct from contextual person/company work relations.
- Exact-credit bridge and explicit developer/publisher role bridge.
- Public query helpers and derived deduplicated statistics.
- Empty generated public artifact until source-backed data is reviewed.
- 17 synthetic semantic tests, included after the existing unit suite.

## Initial official-source research (not imported)

- [The Game Awards 2022](https://thegameawards.com/rewind/year-2022): the official
  winner section confirms Elden Ring as Game of the Year.
- [GDCA Game of the Year archive](https://gamechoiceawards.com/game-of-the-year-award/):
  the 2023 section confirms Elden Ring; the archive also preserves earlier years.
- The D.I.C.E. category page appeared in search, but a direct open returned HTTP 403.
  No D.I.C.E. result has been published on this basis.

These sources do not alone resolve individual catalog editions or personal credits.
No game award has been assigned to Miyazaki, Kojima or another person.

## Validation

- Initial people tests: 14/14 PASS.
- Initial company tests: 18/18 PASS.
- Typecheck: PASS.
- Lint: PASS, 35 warnings in unchanged files, zero errors.
- Existing unit suite: 220/220 PASS, all pretest checks passed.
- Award semantic tests: 17/17 PASS (16 ran via `posttest:unit`, followed by a final
  17/17 dedicated run after adding multi-role deduplication coverage).
- `awards:check`: PASS; deterministic empty publication output.
- Protected application/research data diff against base: empty.
- Build: PASS, including the final repeat after the last domain-only edits (128 static
  pages generated). Final standalone typecheck and changed-file lint also passed.
- Public UI / Preview QA: NOT RUN; UI is not implemented in this milestone.

## Remaining scope

The seven canonical series, evidence-verified recent winners, historical backfill,
person enrichment, audited work identities, formalized legacy awards, public panels,
archive routes, nav/sitemap/metadata and visual acceptance remain pending.

This is NOT READY for publication. The worktree must remain while the branch is
unmerged and the requested implementation is unfinished.
