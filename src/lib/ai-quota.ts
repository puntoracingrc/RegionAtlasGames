import { mutateMarketplaceDocument, readMarketplaceDocument } from "./marketplace-document-store";
import type { UserPlan } from "./marketplace-types";
import { aiQuotaForPlan } from "./plans";

type UsageRow = { userId: string; month: string; count: number };
const DOCUMENT = "ai-usage.json";

function monthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

export async function getAiUsageCount(userId: string): Promise<number> {
  const rows = await readMarketplaceDocument<UsageRow>(DOCUMENT);
  return rows.find((row) => row.userId === userId && row.month === monthKey())?.count ?? 0;
}

export async function consumeAiQuota(userId: string, plan: UserPlan) {
  const month = monthKey();
  const limit = aiQuotaForPlan(plan);
  return mutateMarketplaceDocument<UsageRow, { allowed: boolean; count: number; remaining: number }>(DOCUMENT, (rows) => {
    const index = rows.findIndex((row) => row.userId === userId && row.month === month);
    const count = index === -1 ? 0 : rows[index].count;
    if (count >= limit) return { next: rows, result: { allowed: false, count, remaining: 0 }, changed: false };
    if (index === -1) rows.push({ userId, month, count: count + 1 });
    else rows[index].count = count + 1;
    return { next: rows, result: { allowed: true, count: count + 1, remaining: Math.max(0, limit - count - 1) } };
  });
}

export async function aiQuotaRemaining(userId: string, plan: UserPlan): Promise<number> {
  return Math.max(0, aiQuotaForPlan(plan) - await getAiUsageCount(userId));
}
