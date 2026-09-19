# Published prices: regional history and collection valuation

## Read contract

- Catalogue identity/content remains static. Current prices still come from the existing cached runtime overlay; no new database or collector runs on page load.
- The physical-edition price hero and edition card share one resolved game per exact catalogue identity. The selected edition owns the visible history. No linked game means pending, never the parent page's regional price.
- `getPublishedPriceHistory` merges the historical JSON with the overlay's atomic `priceConnectorReceipts`. Each event uses `publishedAt` and the final `after` price in EUR, not the incoming mean or the delivered total. Existing publications appear without replaying any batch.
- Duplicate batches/timestamps do not create duplicate points. Undefined conditions mean no new observation; explicit null keeps a gap. Conditions without evidence show “sin historial”. Receipts/listing evidence are not sent to the client chart.
- Collection reads resolve each unique edition catalogue ID once, reuse it for all owned copies, and enrich only the view. Existing condition/quantity valuation rules remain in force. Purchase costs, owner estimates, notes and inventory documents are not rewritten.
- Home history uses the same published events, scoped by collection item so physical variants cannot overwrite each other's timeline. On a state-specific publication, other previously observed state values are retained for valuation.

## Performance and freshness

The existing `catalog-overlay` cache (60-second revalidation, immediate invalidation on connector publication) is retained. Region selection uses already-rendered props and makes no price request. The detail page reuses its already-loaded platform catalogue. Collection lookups are deduplicated; bulk overlay reads are limited to four simultaneous calls to avoid an unbounded fan-out when hundreds of prices have been published. Direct catalogue-ID lookups avoid scanning SEO slugs.

Already-open pages refresh when reloaded/navigated; this change does not add live polling or push notifications. No static catalogue/history JSON is rewritten during a publication.

## Verification

Run `npm run test:published-price-views`, `npm run typecheck` (Node heap 6144 MB), lint and the production build. Regression coverage includes `.hack GU Last Recode` 75 → 65 → 70, regional identity, independent conditions, retries, empty history, collection totals/coverage, inventory preservation, bounded reads, and legacy collection/connector behavior.

Browser QA: exact region labels and selector changes; pending region never shows another region's series; newly published price agrees between hero/card/history. The local fixture used for browser verification must not ship. Production QA should check the public detail route and, with an authenticated user session, the collection/dashboard. Never invent authentication or mutate an inventory for verification.
