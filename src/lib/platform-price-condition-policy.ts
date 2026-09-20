import type { ConditionBucket } from "./condition-prices";

export type PlatformPriceMedia = "cartridge" | "optical";
export type PublicPriceCondition = "loose" | "complete" | "sealed";

const CARTRIDGE_PLATFORMS = new Set([
  "nes", "snes", "n64", "gameboy", "gba", "ds", "3ds",
  "mastersystem", "megadrive", "sega32x", "gamegear",
  "neogeo", "neogeo-aes-plus", "hyper-neogeo-64", "neogeopocket",
  "psvita", "switch", "switch2",
]);

export function platformPriceMedia(platformSlug?: string | null): PlatformPriceMedia {
  return CARTRIDGE_PLATFORMS.has((platformSlug ?? "").trim().toLowerCase())
    ? "cartridge"
    : "optical";
}

export function publicPriceConditionsForPlatform(
  platformSlug?: string | null,
): readonly PublicPriceCondition[] {
  return platformPriceMedia(platformSlug) === "cartridge"
    ? ["sealed", "complete", "loose"]
    : ["sealed", "complete"];
}

export function normalizePublicPriceCondition(
  condition: ConditionBucket | "game_manual" | "unknown",
  platformSlug?: string | null,
): PublicPriceCondition | null {
  if (condition === "sealed" || condition === "complete") return condition;
  if (platformPriceMedia(platformSlug) !== "cartridge") return null;
  if (condition === "loose" || condition === "gameManual" || condition === "game_manual") return "loose";
  return null;
}

export function allowedConditionBucketsForPlatform(
  platformSlug: string | null | undefined,
  requested?: readonly ConditionBucket[],
): ConditionBucket[] {
  const allowed = publicPriceConditionsForPlatform(platformSlug);
  if (!requested) return [...allowed];
  return allowed.filter((condition) => requested.includes(condition));
}
