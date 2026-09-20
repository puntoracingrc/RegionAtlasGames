# Literal Blob keys in the direct price connector

## Incident

The PS4 title-qualified batch of 2026-09-20 produced 32 condition receipts whose
prices were absent from public browse results, plus three HTTP 503 failures.
Affected IDs contained literal percent escapes (`%27`) or HTML entities (`&#43;`).
Production logged `BlobDocumentVersionConflictError` during repeated previews.

## Cause and boundary

In the installed `@vercel/blob` 2.8.0 SDK, `get(pathname)` constructs the delivery
URL by interpolating the pathname. By contrast, `head()` sends it as a URL query
parameter and `put()` retains the literal storage key. An unescaped `%27` is
decoded by delivery routing; `#` starts a fragment. Consequently GET can return
not-found while HEAD finds the previously stored document. This both hides
public overlay prices and correctly triggers the writer's consistency guard.

Only the GET transport is now encoded, segment by segment. Storage paths,
catalog IDs, ETag/CAS checks, receipt digests, condition/region/edition gates,
and price averaging remain unchanged. Existing documents require no migration.
Both versioned JSON reads and the public catalog's game/details reads use the
same helper. The index path is unchanged in practice because it is URL-safe.

## Regression evidence

- Three path-contract tests failed before the fix and pass afterward.
- A no-network test runs the real installed Blob SDK against an HTTP mock,
  asserting the exact encoded GET URL for percent escapes, entities and plain IDs.
- Literal percent, query, fragment, non-ASCII and encoded slash cases round-trip.
- Head/write keys remain raw and CAS uses the authoritative ETag.
- Reopening an already-priced encoded-ID document returns its original receipt,
  skips the write and keeps 15 EUR instead of averaging again to 17.50 EUR.
- Existing incomplete-stream, stale ETag, duplicate-listing, money/identity,
  collection valuation and regional price-view tests remain release gates.

## Production recovery protocol

1. Deploy the fix through the standard checked code release.
2. Read the 32 receipt-backed prices; do not create another batch to recover them.
3. Retry only the three unconfirmed entries with the original batch ID, task ID,
   listings and means. The server ledger is authoritative if a response was lost.
4. Compare every confirmed condition in the batch against the public API again.
5. Regenerate the report and workbook only from validated receipts; preserve
   original evidence and document before/after recovery counts.

The batch artifacts live outside Git. They are not part of this code change.
