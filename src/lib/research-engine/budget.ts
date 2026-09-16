import type { ResearchPriority } from "./types";
import type { ResearchBudgetLimits, ResearchBudgetUsage, ResearchModelUsage } from "./v2-types";

const baseBudgets: Record<ResearchPriority, Omit<ResearchBudgetLimits, "maxTokens" | "maxCostUsd" | "maxBrowserSessions">> = {
  P0: { maxSearches: 20, maxPages: 30, maxImages: 20, maxAgentTurns: 12 },
  P1: { maxSearches: 12, maxPages: 20, maxImages: 12, maxAgentTurns: 8 },
  P2: { maxSearches: 6, maxPages: 10, maxImages: 6, maxAgentTurns: 4 },
};

export function defaultResearchBudget(priority: ResearchPriority): ResearchBudgetLimits {
  const configuredCost = Number(process.env.RESEARCH_MAX_COST_USD);
  return {
    ...baseBudgets[priority],
    maxTokens: priority === "P0" ? 120_000 : priority === "P1" ? 80_000 : 40_000,
    maxCostUsd: Number.isFinite(configuredCost) && configuredCost >= 0 ? configuredCost : 1,
    maxBrowserSessions: priority === "P0" ? 6 : priority === "P1" ? 4 : 2,
  };
}

export function emptyResearchBudgetUsage(): ResearchBudgetUsage {
  return {
    searches: 0,
    pages: 0,
    images: 0,
    agentTurns: 0,
    browserSessions: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
  };
}

export type ResearchBudgetCounter = keyof Pick<
  ResearchBudgetUsage,
  "searches" | "pages" | "images" | "agentTurns" | "browserSessions"
>;

const limitsForCounter: Record<ResearchBudgetCounter, keyof ResearchBudgetLimits> = {
  searches: "maxSearches",
  pages: "maxPages",
  images: "maxImages",
  agentTurns: "maxAgentTurns",
  browserSessions: "maxBrowserSessions",
};

export function budgetAllows(limits: ResearchBudgetLimits, usage: ResearchBudgetUsage, counter: ResearchBudgetCounter, amount = 1): boolean {
  if (usage[counter] + amount > limits[limitsForCounter[counter]]) return false;
  if (usage.inputTokens + usage.outputTokens > limits.maxTokens) return false;
  if (usage.estimatedCostUsd >= limits.maxCostUsd) return false;
  return true;
}

export function recordBudgetUse(usage: ResearchBudgetUsage, counter: ResearchBudgetCounter, amount = 1): ResearchBudgetUsage {
  return { ...usage, [counter]: usage[counter] + amount };
}

export function recordModelUsage(usage: ResearchBudgetUsage, model: ResearchModelUsage): ResearchBudgetUsage {
  return {
    ...usage,
    inputTokens: usage.inputTokens + model.inputTokens,
    outputTokens: usage.outputTokens + model.outputTokens,
    estimatedCostUsd: Math.round((usage.estimatedCostUsd + model.estimatedCostUsd) * 1_000_000) / 1_000_000,
  };
}

export function budgetExhaustionReason(limits: ResearchBudgetLimits, usage: ResearchBudgetUsage): string | null {
  if (usage.searches >= limits.maxSearches) return "SEARCH_BUDGET_EXHAUSTED";
  if (usage.pages >= limits.maxPages) return "PAGE_BUDGET_EXHAUSTED";
  if (usage.images >= limits.maxImages) return "IMAGE_BUDGET_EXHAUSTED";
  if (usage.agentTurns >= limits.maxAgentTurns) return "AGENT_TURN_BUDGET_EXHAUSTED";
  if (usage.browserSessions >= limits.maxBrowserSessions) return "BROWSER_BUDGET_EXHAUSTED";
  if (usage.inputTokens + usage.outputTokens >= limits.maxTokens) return "TOKEN_BUDGET_EXHAUSTED";
  if (usage.estimatedCostUsd >= limits.maxCostUsd) return "COST_BUDGET_EXHAUSTED";
  return null;
}
