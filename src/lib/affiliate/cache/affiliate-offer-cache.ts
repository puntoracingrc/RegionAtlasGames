import { affiliateCacheTtlMinutes } from "../config";
import type { AffiliateOffer } from "../types";

type CacheEntry = {
  expiresAt: number;
  offers: AffiliateOffer[];
};

const cache = new Map<string, CacheEntry>();

export function getAffiliateOfferCache(key: string): AffiliateOffer[] | null {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.offers;
}

export function setAffiliateOfferCache(key: string, offers: AffiliateOffer[]): void {
  cache.set(key, {
    offers,
    expiresAt: Date.now() + affiliateCacheTtlMinutes() * 60_000,
  });
}
