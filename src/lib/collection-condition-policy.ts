import type { CollectionCondition } from "./types";

export type PricedCollectionCondition = Exclude<CollectionCondition, "unknown">;
export type CollectionDefaultConditions = Partial<Record<string, PricedCollectionCondition>>;

export const DEFAULT_COLLECTION_CONDITION: PricedCollectionCondition = "complete";

export const PRICED_COLLECTION_CONDITIONS: readonly PricedCollectionCondition[] = [
  "sealed",
  "complete",
  "game-manual",
  "loose",
];

// `game-manual` is a real collector bucket, but it only describes cartridge media well.
const GAME_MANUAL_PLATFORMS = new Set([
  "nes",
  "snes",
  "n64",
  "gameboy",
  "ds",
  "3ds",
  "mastersystem",
  "megadrive",
  "sega32x",
  "gamegear",
  "neogeo",
  "neogeopocket",
  "psvita",
  "switch",
  "switch2",
  "gba",
]);

export function isPricedCollectionCondition(
  value: unknown,
): value is PricedCollectionCondition {
  return PRICED_COLLECTION_CONDITIONS.includes(value as PricedCollectionCondition);
}

export function supportsGameManualCondition(platformSlug: string): boolean {
  return GAME_MANUAL_PLATFORMS.has(platformSlug.trim().toLowerCase());
}

export function availableCollectionConditions(
  platformSlug: string,
): PricedCollectionCondition[] {
  return PRICED_COLLECTION_CONDITIONS.filter(
    (condition) => condition !== "game-manual" || supportsGameManualCondition(platformSlug),
  );
}

/** Conserva estados históricos con precio y convierte la antigua ausencia de estado en completo. */
export function normalizeLegacyCollectionCondition(
  value: CollectionCondition | null | undefined,
  sealed = false,
): PricedCollectionCondition {
  if (sealed || value === "sealed") return "sealed";
  return isPricedCollectionCondition(value) ? value : DEFAULT_COLLECTION_CONDITION;
}

export function normalizeDefaultCollectionCondition(
  value: unknown,
  platformSlug: string,
): PricedCollectionCondition {
  if (!isPricedCollectionCondition(value)) return DEFAULT_COLLECTION_CONDITION;
  return availableCollectionConditions(platformSlug).includes(value)
    ? value
    : DEFAULT_COLLECTION_CONDITION;
}

export function defaultCollectionConditionForPlatform(
  preferences: CollectionDefaultConditions | null | undefined,
  platformSlug: string,
): PricedCollectionCondition {
  return normalizeDefaultCollectionCondition(preferences?.[platformSlug], platformSlug);
}

export function sanitizeCollectionDefaultConditions(
  value: unknown,
  allowedPlatformSlugs?: ReadonlySet<string>,
): CollectionDefaultConditions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>).flatMap(([rawSlug, condition]) => {
    const slug = rawSlug.trim().toLowerCase();
    if (!/^[a-z0-9-]{1,50}$/.test(slug)) return [];
    if (allowedPlatformSlugs && !allowedPlatformSlugs.has(slug)) return [];
    if (!isPricedCollectionCondition(condition)) return [];
    return [[slug, normalizeDefaultCollectionCondition(condition, slug)] as const];
  });
  return Object.fromEntries(entries);
}
