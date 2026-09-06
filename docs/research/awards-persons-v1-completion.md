# AWARDS-PERSONS-V1 completion

## Baseline and release gates

- Foundation: PR #193, merge `8009c2928a1980d99d6976a333653d66da934a1a`.
- Implementation base: `aa65457c7acc54e33745b1615c96a5997ceb0387`.
- Release status: local validation completed; remote Quality, Preview and Production remain mandatory. The final PR comment records immutable SHAs and deployments.
- The existing file-backed domain, hash approvals, deterministic builder and `award-study/public.json` remain authoritative. No database, alternate work ID or fuzzy publication was introduced.

## Published dataset

| Measure | Count |
| --- | ---: |
| Award organizations | 7 |
| Editions | 183 |
| Categories | 20 |
| Game-winning results | 195 |
| Personal awards | 20 |
| Finalist results | 6 |
| Total results | 221 |
| Verified work records | 17 |
| Exact person-work links | 2 |
| Company-work-role links | 5 |
| Referenced primary sources | 114 |
| New verified catalog-to-work links | 50 |

The personal links enrich existing Hidetaka Miyazaki and Hideo Kojima profiles through existing exact editorial credits, preserving the recorded roles. Direct formal awards also enrich existing public recipients, including Shigeru Miyamoto. No new person is made public.

Company links distinguish FromSoftware (developer), Larian Studios (developer and publisher), Supergiant Games (developer) and Sony Interactive Entertainment (publisher). Results are deduplicated independently of the number of commercial catalog entries. No parent or subsidiary inheritance is used.

## Research and deliberate review boundaries

The seven organizations have official-source recent winners and available historical top-award backfills: TGA 2014 onward; DICE 1998 onward; BAFTA 2004 onward with the archive's missing 2008 ceremony; GDCA 2001 onward; Japan Game Awards 1997 onward; IGF 1999 onward; and Golden Joystick's available historical archive plus recent primary announcements.

Every result stores official evidence. A source-proven winner may be displayed by its official name without a catalog hyperlink when its precise work identity is unresolved. Such a result cannot propagate to a catalog entry, person or company by name or QID. Examples include Sunbreak, and the 2015 Outer Wilds prototype, which must not automatically become the later commercial game.

`backfill-review.json` records 165 concrete catalog-identity, historical-gap and future-result review items. Golden Joystick historical archive year labels are retained as documented; gaps in 1993-1995 and 1997-2001 are not filled speculatively. Upcoming ceremonies never have invented winners. This report does not claim that all historic award-winning works are linked to catalog entries, or that all secondary categories were imported.

All 364 legacy personal recognitions have an explicit disposition: 18 linked formal awards, eight general recognitions retained, 338 needing further review. Existing approved legacy recognitions remain visible unless replaced by an exact public formal link; no personal data was deleted. These 338 records are not asserted to be verified formal awards.

The priority-person review preserves editorial gates for Sam Lake, Todd Howard, Neil Druckmann, Josef Fares, Eric Barone, Naoki Yoshida, Swen Vincke and Guillaume Broche. Internal profiles and unresolved candidates do not acquire public routes. No inferred founder-to-game authorship was added.

## Public surfaces

- `/premios`, organization, edition, category and latest-winner routes.
- Main navigation, sitemap, canonical and OpenGraph metadata.
- Organization selection method, archive, historical top award and derived statistics.
- One refactored person recognition section: personal awards versus work awards with exact role and explicit work-recipient wording.
- Catalog work awards via `getCatalogWorkKey`, with a commercial-edition disclaimer and collapsible nominations.
- Separate company direct, developed-game and published-game awards.

## Preservation proof

Run `node scripts/verify-awards-v1-scope.mjs aa65457c7acc54e33745b1615c96a5997ceb0387`.

- 73,104 catalog entries; 73,104 unique IDs; 4,481 companies.
- 4,701 tracked protected files unchanged against the base, including catalog, details, meta, company and person studies, public assets, collection and marketplace boundaries.
- Catalog SHA-256: `ca6c8183130a9eb8be872a6cc0e37a10aae7cc4825f1d71f245fd90b6ada73c0`.
- All 1,199 existing work identity mappings remain unchanged; 50 explicit approved mappings added.
- No catalog IDs, routes, prices, covers, credits or existing entity identities modified.

The historical PS4 rapid-review checks previously required the shared identity map to have exactly their old size. They now check every original mapping as an exact subset, preserving the existing Annapurna successor exception. No batch credit or catalog data changes accompany this compatibility adjustment.

## Reproduction

```sh
npx tsx scripts/prepare-awards-v1.ts --check
npm run awards:check
npm run test:awards
npm run test:people
npm run test:companies
npm run test:unit
npm run test:collector-controls
npm run test:affiliate-offers-v1
npm run typecheck
npm run lint
npm run build
node scripts/verify-awards-v1-scope.mjs
npx tsx scripts/qa-awards-v1.ts BASE_URL OUTPUT_DIRECTORY
```

The original 17 domain guarantees remain; expanded award coverage passes 25/25. The main unit suite passes 220/220, with people/company/collection and catalog-count prechecks. Collector controls and affiliate-offer checks pass. Lint has zero errors and 35 pre-existing warnings outside this feature.

Browser QA covers 16 public routes on 1440x1000 desktop and 390x844 mobile, plus six negative routes. It checks response status, visible image decoding, console errors and horizontal overflow, saving screenshots and a JSON report. Exact Preview and Production results will be attached to the PR rather than implied by local QA.

## Rollback

Revert the completion commits to return to the published foundation. Original catalog data and work mappings are preserved. Do not remove legacy person recognition data, reset unrelated worktrees, or overwrite newer production catalog batches.
