# Admin price review: authoritative read recovery

## Scope

The production review queue failed intermittently, then recovered before this
change was deployed. The previous reader hid transport details, so this change
does not claim a diagnosed HTTP root cause.

- Bound the uncached HTTP read to 10 seconds.
- Validate the complete queue and decision history on both transports.
- On HTTP failure, read the same live queue through the existing SFTP connection.
- If both fail, keep review unavailable rather than substitute local data.
- Log transport and safe error codes only; never credentials, URLs or raw errors.
- Preserve mutation locks, atomic writes, decisions, pricing and AI behavior.

No catalog, price, company, image or learning data is included in this code diff.
The separate operator review of one existing USA listing uses the normal Admin
acceptance flow and is not an automatic consequence of this reader change.

## Local verification

- Seven new reader tests pass and run through `posttest:unit`.
- `npm run typecheck`: pass.
- `npm run lint`: zero errors; 35 existing warnings.
- `npm run test:unit`: pass, including existing hooks and the seven new tests.
- `npm run test:collector-controls`: pass.
- `npm run test:affiliate-offers-v1`: pass.
- `npm run build`: pass with worktree-local dependencies.
- `npm audit --omit=dev --audit-level=high`: pass; one moderate existing
  `baseline-browser-mapping` advisory remains outside this change.
- Existing HTTP reader: real queue read succeeded in 0.948 seconds.
- Forced nonexistent HTTP path in a local process: HTTP 404 followed by a
  successful live SFTP read in 6.208 seconds, with 4,136 pending items returned.
  No remote environment was changed and no decision was written by this probe.

The initial local build attempt used a dependency symlink outside the worktree;
Turbopack refused that layout. Installing dependencies locally fixed the build.
There is no application workaround or dependency update in this PR.

## Release gates

Require exact-HEAD Quality and Preview success before merge. Record Production
deployment identity and authenticated Admin readback in the PR after release.
