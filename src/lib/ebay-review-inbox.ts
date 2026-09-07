import type { PriceReviewQueue } from "./admin-price-review";

export function mergeEbayReviewInbox(queue: PriceReviewQueue, inbox: PriceReviewQueue): PriceReviewQueue {
  const existing = new Set(queue.items.map((item) => item.id));
  const decided = new Set(queue.decisions.map((decision) => String(decision.id ?? "")));
  const additions = inbox.items.filter((item) => {
    if (item.status !== "pending" || !item.source.startsWith("ebay") || existing.has(item.id) || decided.has(item.id)) return false;
    existing.add(item.id);
    return true;
  });
  return { ...queue, items: [...queue.items, ...additions] };
}
