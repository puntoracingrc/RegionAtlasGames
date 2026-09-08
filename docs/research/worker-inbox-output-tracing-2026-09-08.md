# Worker inbox: avoid duplicate serverless packaging

Base: `be5ba4eaa86620cb873e77c35fbcd8f5cfd4b997`.

PR #210 is merged as `3288437afcf8ce6da828413bb3101fed9909a347`; its Production deployment `dpl_79zKtePJLrir2xn8CNS2RymZKB3Z` is READY. The eBay batch already running on the old engine subsequently committed updated prices and review evidence. That independent bot commit increased the review inbox from 3,854,340 to 6,685,184 bytes. Its deployment `dpl_3Pw1UTFjgndy7bzsbPVfsokpLjFE` failed: `admin/precios` was 253.77 MB uncompressed.

## Narrow correction

Exclude exactly `data/ebay-regional-campaigns/review-queue.json` from output file tracing. `src/lib/admin-price-review.ts` imports this file statically as `ebayReviewInbox`; Next embeds its contents in the compiled server module. Shipping the raw file as well duplicates those data.

This is distinct from the mutable `data/admin/price-review-queue.json`, which Admin reads/writes locally or on the configured remote server and which is NOT excluded. The GitHub campaign and offline review tools keep their original repository file. Worker sync does not upload this bundled eBay inbox, and no runtime TypeScript consumer reads that source JSON through the filesystem.

No entries are deleted, compressed away or hidden. No photos, assets, catalogue, company data, prices, queue data, credentials, server settings or model behavior are modified by this fix. No storage transfer to IONOS is needed. The complete original JSON remains versioned for builds, audit and collector runs.

## Release controls

Verify build, Quality and Preview on the new HEAD. Check that server traces omit only this raw duplicate while compiled server chunks still contain the complete serialized inbox. Confirm current catalog IDs and all data blobs are identical to the base, then verify the public Production release SHA and smoke routes. Keep the existing worker running; do not restart it or reapprove its queue for this packaging change.

The 73,107 rows/unique IDs are the current audit cut, not a permanent growth restriction. PR #210's known Mini OCR/reference-contamination limitations remain documented and are not claimed to be fixed here.
