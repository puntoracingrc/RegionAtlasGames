import type { UserPlan } from "./marketplace-types";

export const PLAN_LIMITS = {
  free: {
    label: "Gratuito",
    canTrade: false,
    aiAnalysisPerMonth: 0,
  },
  pro: {
    label: "Pro",
    canTrade: true,
    aiAnalysisPerMonth: 30,
  },
} as const;

export function canUseMarketplace(plan: UserPlan): boolean {
  return PLAN_LIMITS[plan].canTrade;
}

export function aiQuotaForPlan(plan: UserPlan): number {
  return PLAN_LIMITS[plan].aiAnalysisPerMonth;
}

export function planLabel(plan: UserPlan): string {
  return PLAN_LIMITS[plan].label;
}
