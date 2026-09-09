# Review queue read throughput

Base: `2045c9db8c5a72cc5240e6564f449515cfb45e27` (PR #216).

The previous Production save was confirmed after 285.486 seconds. This change
targets transfer latency only; it does not change decisions, queue schemas,
catalogue data, model policy or the PC worker.

## Change and preservation

- Only the web review transaction uses `withParallelReviewReads`.
- Existing `ssh2-sftp-client.fastGet` reads document blocks with concurrency 8
  and the library's normal 32 KiB chunk size. No dependency upgrade.
- Lock reads and all writes retain the original streaming implementation.
- Exclusive `wx` creation, owner checks, atomic rename, complete temporary and
  final readbacks, and history-preservation checks remain unchanged.
- Downloads use a unique private temporary directory (0700) and file (0600),
  removed in `finally`, including partial-download failures. No shared cache.
- Unsupported or interrupted parallel reads fail closed. No silent fallback,
  stale local document or empty replacement is returned.
- No UI, catalogue, price, cover, credit, collection or research edits.

The library documents that parallel transfers depend on server support:
[ssh2-sftp-client](https://github.com/theophilusx/ssh2-sftp-client#fastgetremotepath-localpath-options--string).
The actual IONOS endpoint was tested with synthetic data before integration.
Parallel upload was investigated but deliberately not adopted: the existing
exclusive write path is retained.

## Reproducible benchmark

Run explicitly with an existing SFTP environment, never as part of unit tests:

```sh
node --env-file=/absolute/path/to/.env.local --import tsx \
  scripts/benchmark-price-review-transfer.ts \
  --remote-root price-worker --output /absolute/path/to/report.json
```

The command creates only its own UUID-named directory under `jobs`, with no job
request. It does not access the operational queue. It compares the full shared
lock/read/write/readback/rename/readback protocol and the derived learning write,
using the same connection and synthetic inputs. Cleanup refuses unexpected
filenames and records whether the remote directory was removed.

Measured on 2026-09-09, local Mac to IONOS, Node v24.16.0:

| Mode | Full transaction | Queue reads | Learning reads |
| --- | ---: | ---: | ---: |
| Existing streams | 68,460 ms | 3 | 2 |
| Parallel document reads | 19,532 ms | 3 | 2 |

- Reduction: 71.47%; approximately 3.50 times faster in this paired trial.
- Queue: 18,874,630 bytes; learning: 409,642 bytes.
- Both final queue hashes:
  `f5fba4758ae1b9d465622fa2160a18dc00060a39ee31f97773a4d4dcf8fc5d5c`.
- Run: `e095297c-8de9-405a-af84-49983cb0c010`.
- Started `2026-09-09T11:30:54.385Z`; ended `2026-09-09T11:32:31.985Z`.
- Full byte assertions passed; locks and remote benchmark directory removed.
- Earlier 19,573,451-byte transfer probe: stream read 46.385 s; bounded parallel
  reads 5.160 / 5.384 s (8) and 2.806 / 2.945 s (16). All hashes matched and
  its remote/local temporary files were removed. Runtime uses the lower bound, 8.

These are synthetic local measurements, not a claim of a 19.5-second Production
save. Network conditions differ. No real review was accepted or rejected to
benchmark. No paid AI request was made. The full JSON document still grows with
history, so this is not an unlimited-size synchronous storage guarantee.

## Verification

- Review tests: 32/32, including 7 new transfer cases.
- Main unit group: 236/236; pre/post suites passed.
- Scanner: 50/50; collector controls including Python review store: passed.
- Affiliate controls, typecheck and lint: passed.
- Lint: 35 pre-existing warnings, no errors, none in changed files.
- Production dependency audit: no high/critical vulnerabilities; one existing
  moderate `baseline-browser-mapping` advisory. Lockfile unchanged.
- Production build passed (133 static pages). Remote Quality/Preview results
  are recorded in the PR closure note.
- `git diff --exit-code origin/main -- data public`: empty.
- Current cut remains 73,107 catalogue records and unique IDs, 4,481 companies.
- Catalogue blob: `60c85aeee03b634c4692a01af9fe5ac881a087f8`.
- Company blob: `f1499edd5650d013ac3d9c9a3b1948b14262b4af`.

Production remains on the base until separately released. Rollback consists of
reverting this adapter/integration; there is no data migration or format change.
