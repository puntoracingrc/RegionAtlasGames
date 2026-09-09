# Activation runtime correction

PR #215 was merged as `3000ddac41eb9403b2e2146f57f1038c033ada5b`.
Production and the restarted PC both serve that commit. Main Quality passed.

The authenticated Production smoke test exposed a missing deployment constraint:
the per-item POST was terminated by Vercel after its configured 120 seconds.
The request was a justified rejection of an anime DVD listing mistakenly linked
to Game Boy Ninja Boy (review `f6a741a559c814b3fb82`, eBay `271980135867`).
The UI did not hide the item or decrement the counter after the HTTP 504.

Audit after the invocation terminated confirmed that the authoritative queue and
derived learning remained byte-identical to their pre-activation backups:

- 6,445 items and 2,872 decisions preserved; the rejection was not committed.
- Queue SHA256: `99a892787c1d8fb52e4c1d26c9b9ca9f345f862640183f2925939c50838144b8`.
- Learning SHA256: `b3c22e6792afa4a6bf67baa0a90ad220886ff402c64aa22d71fc18e1c4018c43`.
- A complete temporary upload and the failed invocation's lock were retained.
  They must be archived only after verifying the terminated owner's identity,
  stable bytes and preserved authoritative history. Do not promote the temporary
  file or repeat a decision without checking the current state.

This follow-up raises only the five existing shared queue mutation routes to
300 seconds, matching Vercel's documented Fluid duration allowance. It retains
exclusive locking, atomic rename, every full readback and failure reporting.
No catalogue data, prices, matching rules or paid model operations are changed.
The budget must be verified against a real successful save before release closure;
it is not a claim that all future queue sizes will fit synchronous requests.

Validation: typecheck, lint, focused review tests and build; CI Quality and Preview
must pass before merge. Final live timings, reconciliation, UI QA and worker SHA
are recorded in the release comments and local activation evidence.
