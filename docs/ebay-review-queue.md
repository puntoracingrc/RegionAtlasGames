# eBay campaign to Admin review

The campaign appends pending eBay candidates to
`data/ebay-regional-campaigns/review-queue.json` before price synchronization.
It uses the existing review-item schema, IDs and reason mapping. No pending
candidate is approved by this connection, and no catalog price rules change.
The regular campaign commit includes this inbox; deployment makes it available
to Admin > Precios > Revision without new credentials or public API routes.

All existing review reads and manual decisions merge this inbox with the
worker queue. Worker items and decision IDs take precedence. Repeated inbox
reads cannot reopen accepted/rejected items or duplicate pending items.
No size cap silently discards inbox candidates. Other sources are unchanged.
PC image/vision jobs first synchronize the merged queue through the existing
writer; if the remote queue cannot be read or written, no job is submitted.

The GitHub evidence artifact retains the raw ingest, report, review inbox and
the region/condition/listing caches for 90 days, even on failed runs. It does
not include the eBay credential cache. The raw files live outside the temporary
directory so a price-sync failure cannot delete them. Pictures are referenced
by their original URLs, not archived as image binaries; they can expire.
Review items contain the original URL, image URLs, reason, region evidence,
searched catalog ID and batch ID where supplied by the collector.

Existing historical batches whose raw evidence was deleted cannot be rebuilt
by this change. The initial inbox is deliberately empty, without invented
historical candidates. Accepted and rejected raw examples remain in the audit
artifact, not as newly pending Admin reviews.

Offline checks:

```
python3 scripts/test_ebay_review_inbox.py
python3 scripts/test_ebay_regional_campaign.py
npx tsx --test src/lib/ebay-review-inbox.test.ts src/lib/admin-price-review.test.ts
npm run typecheck
npm run lint
```
