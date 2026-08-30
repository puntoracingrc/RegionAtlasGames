import type { UserPlan } from "./marketplace-types";

export const OPEN_ACCESS_AI_ANALYSES_PER_MONTH = 30;

export function canViewCollectionValue(plan: UserPlan): boolean {
  void plan;
  return true;
}

export function aiQuotaForPlan(plan: UserPlan): number {
  void plan;
  return OPEN_ACCESS_AI_ANALYSES_PER_MONTH;
}
