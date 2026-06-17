import { normalizeAffiliateText } from "./normalize-title.ts";

export function regionAliases(region?: string): string[] {
  const normalized = normalizeAffiliateText(region ?? "");
  if (!normalized) return [];
  if (normalized.includes("pal") && normalized.includes("esp")) return ["pal espana", "pal es", "spain", "spanish", "espana"];
  if (normalized.includes("pal") && (normalized.includes("eu") || normalized.includes("eur"))) {
    return ["pal europe", "pal europa", "europe", "eu", "eur"];
  }
  if (normalized.includes("ntsc") && normalized.includes("j")) return ["ntsc j", "japan", "japon", "japanese"];
  if (normalized.includes("ntsc") && normalized.includes("u")) return ["ntsc u", "usa", "us", "america"];
  return [normalized];
}

export function regionConflicts(text: string, region?: string): boolean {
  const normalized = normalizeAffiliateText(text);
  const aliases = regionAliases(region);
  if (aliases.length === 0) return false;
  const isPal = aliases.some((alias) => alias.includes("pal") || alias.includes("spain") || alias.includes("europe"));
  if (isPal && /\bntsc\b|\bjapan\b|\bjapanese\b|\busa\b/.test(normalized)) return true;
  const isJapan = aliases.some((alias) => alias.includes("japan") || alias.includes("ntsc j"));
  if (isJapan && /\bpal\b|\bespana\b|\beurope\b|\busa\b/.test(normalized)) return true;
  return false;
}

export function regionMatches(text: string, region?: string): boolean {
  const normalized = normalizeAffiliateText(text);
  return regionAliases(region).some((alias) => normalized.includes(normalizeAffiliateText(alias)));
}
