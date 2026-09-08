import type { PriceReviewQueue } from "./admin-price-review";

export function mergeEbayReviewInbox(queue: PriceReviewQueue, inbox: PriceReviewQueue): PriceReviewQueue {
  const existing = new Set(queue.items.map((item) => item.id));
  const decided = new Set(queue.decisions.map((decision) => String(decision.id ?? "")));
  const reviewed = new Map(inbox.items.filter((item) => {
    const decision = item.decision;
    return item.source.startsWith("ebay") && decision?.reviewBatch && decision.reviewer
      && (decision.action === "accept" || decision.action === "reject")
      && item.status === (decision.action === "accept" ? "accepted" : "rejected")
      && inbox.decisions.some((entry) => entry.id === item.id && entry.reviewBatch === decision.reviewBatch
        && entry.action === decision.action && entry.catalogId === decision.catalogId);
  }).map((item) => [item.id, item]));
  const imported = new Set<string>();
  const items = queue.items.map((item) => {
    const replacement = reviewed.get(item.id);
    if (item.status === "pending" && !decided.has(item.id) && replacement) {
      imported.add(item.id);
      return replacement;
    }
    return item;
  });
  const additions = inbox.items.filter((item) => {
    if (!item.source.startsWith("ebay") || existing.has(item.id) || decided.has(item.id)) return false;
    if (item.status !== "pending" && !reviewed.has(item.id)) return false;
    if (reviewed.has(item.id)) imported.add(item.id);
    existing.add(item.id);
    return true;
  });
  return { ...queue, items: [...items, ...additions], decisions: [
    ...queue.decisions, ...inbox.decisions.filter((entry) => imported.has(String(entry.id))),
  ] };
}
