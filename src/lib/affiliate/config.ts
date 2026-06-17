import type { AffiliateProvider } from "./types";

function boolEnv(name: string, defaultValue = false): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return defaultValue;
  return value === "1" || value === "true" || value === "yes";
}

function numberEnv(name: string, defaultValue: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export const AFFILIATE_PROVIDERS: Record<
  AffiliateProvider,
  { enabled: boolean; productionReady: boolean; requiresDisclosure: boolean }
> = {
  rakuten: {
    enabled: boolEnv("RAKUTEN_AFFILIATE_ENABLED", false),
    productionReady: false,
    requiresDisclosure: true,
  },
  ebay: {
    enabled: boolEnv("EBAY_AFFILIATE_ENABLED", false),
    productionReady: false,
    requiresDisclosure: true,
  },
  amazon: {
    enabled: boolEnv("AMAZON_AFFILIATE_ENABLED", false),
    productionReady: false,
    requiresDisclosure: true,
  },
  manual: {
    enabled: true,
    productionReady: true,
    requiresDisclosure: true,
  },
  mock: {
    enabled: boolEnv("AFFILIATE_MOCK_PROVIDER_ENABLED", false),
    productionReady: false,
    requiresDisclosure: true,
  },
};

export function affiliateOffersEnabled(): boolean {
  return boolEnv("AFFILIATE_OFFERS_ENABLED", false);
}

export function affiliateCacheTtlMinutes(): number {
  return Math.max(5, numberEnv("AFFILIATE_OFFERS_CACHE_TTL_MINUTES", 360));
}

export function affiliateMinConfidenceToShow(): number {
  return Math.min(1, Math.max(0, numberEnv("AFFILIATE_MIN_CONFIDENCE_TO_SHOW", 0.85)));
}

export function affiliateMinConfidenceRelated(): number {
  return Math.min(1, Math.max(0, numberEnv("AFFILIATE_MIN_CONFIDENCE_RELATED", 0.65)));
}
