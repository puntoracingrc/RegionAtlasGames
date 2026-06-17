import { normalizeAffiliateText } from "./normalize-title.ts";

const PLATFORM_SYNONYMS: Record<string, string[]> = {
  ps1: ["ps1", "playstation", "sony playstation"],
  ps2: ["ps2", "playstation 2"],
  ps3: ["ps3", "playstation 3"],
  ps4: ["ps4", "playstation 4"],
  ps5: ["ps5", "playstation 5"],
  gb: ["gb", "game boy"],
  gbc: ["gbc", "game boy color"],
  gba: ["gba", "game boy advance"],
  n64: ["n64", "nintendo 64"],
  gc: ["gc", "gamecube", "nintendo gamecube"],
  md: ["md", "mega drive", "genesis"],
  snes: ["snes", "super nintendo"],
  nes: ["nes", "nintendo entertainment system"],
};

export function platformAliases(platform?: string): string[] {
  if (!platform) return [];
  const normalized = normalizeAffiliateText(platform);
  return Array.from(new Set([normalized, ...(PLATFORM_SYNONYMS[normalized] ?? [])]));
}

export function platformMatches(text: string, platform?: string): boolean {
  const normalized = normalizeAffiliateText(text);
  return platformAliases(platform).some((alias) => normalized.includes(normalizeAffiliateText(alias)));
}
