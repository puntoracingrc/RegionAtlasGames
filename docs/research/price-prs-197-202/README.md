# Reconciliation of price PRs #197 and #202

Both automated PRs contain the same TodoConsolas campaign, `20260905T201323Z`.
Their four TodoConsolas fields are identical; other differences between their
heads come from different base commits. Neither original branch is merged.

## Decision

- 354 distinct observations: 287 PS4, 63 PS5, 4 Switch 2.
- Accept 353: 51 new retail prices, 4 changed prices, 298 unchanged amounts
  with a newer observation date.
- Reject `ps4-persona-5-strikers`: the listing explicitly says limited edition,
  while the destination is standard. Its reference match alone is insufficient.
- Preserve the existing value of rejected records, rather than deleting data.
- No regional candidates are imported. Source and destination platform, region,
  title and edition are checked against the current catalog. HTML entities and
  punctuation are normalized only for comparison, not written back.
- Two explicit title equivalents are permitted: Tales of (the) Neon Sea and
  This Is the Police 2/II. Source references remain in the per-row evidence.
- Imported prices remain `tcnsRetailPrice`, condition `preowned`, never a
  replacement for complete/sealed/loose market estimates or a sold-price claim.
- Use each listing's actual `collectedAt`, not the campaign start timestamp.
- Mark the campaign processed to prevent the scheduled publisher from creating
  another copy, including the rejected row. Raw evidence and rejection survive.

## Preservation

Base: `177bf42b20db1e7c2cfb9859f00715ef34b81d57`.
73,104 entries and unique IDs before and after. Only four `tcns*` fields change.
URLs of games, covers, credits, estimates, companies and other entities are
unchanged. Existing price history, sync rotation state and metadata are retained.
The original PRs' broad history refresh is not needed to import retail prices.
The detailed report itself records the source observation and before/after.

## Evidence and reproduction

Frozen worker artifacts are adjacent to this file. The campaign is ready_for_git.
Their SHA-256 hashes, all accepted before/after values and the rejected row are
recorded in `report.json`. The worker progress counter says 355, but the final
deduplicated manifest and ingest agree on 354 distinct IDs; the script checks both.

```
python3 scripts/reconcile-price-prs-197-202.py
python3 scripts/reconcile-price-prs-197-202.py --apply
python3 scripts/reconcile-price-prs-197-202.py --check
```

Application refuses any catalog that differs from the reviewed base or expected
result. Reapplying is idempotent. This is a historical batch comparator, not a
permanent product-wide count restriction. No collector is run by this script.

Live source spot checks on 2026-09-06 returned HTTP 200 and matching retail prices:
Archetype Arcadia PS4 EUR 11.95, Tomb Raider Definitive Edition PS4 EUR 11.95,
Kena Bridge of Spirits Deluxe Edition PS5 EUR 19.95. The full batch validation
uses the captured source evidence, not a claim of 353 manual product-page reviews.

Release checks and production deployment evidence are recorded on the replacement
PR. Close #197 and #202 as superseded only after the accepted data are published.
