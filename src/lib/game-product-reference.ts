import type { CatalogGame, GameDetails } from "./types";
import { getPlatform } from "./catalog";

/** Patrones de referencia producto (alineados con scripts/collectors/reference_match.py). */
const REFERENCE_PATTERNS: RegExp[] = [
  /\b(CUSA-\d{5,6})\b/gi,
  /\b(BLUS-\d{5,6})\b/gi,
  /\b(BLES-\d{5,6})\b/gi,
  /\b(BLJM-\d{5,6})\b/gi,
  /\b(NPUB-\d{5,6})\b/gi,
  /\b(NPEB-\d{5,6})\b/gi,
  /\b(NPJB-\d{5,6})\b/gi,
  /\b(ULES-\d{5,6})\b/gi,
  /\b(ULUS-\d{5,6})\b/gi,
  /\b(T-\d{1,6}[A-Z0-9]*(?:-\d{2})?)\b/gi,
  /\b(HDR-\d{4,6})\b/gi,
  /\b(GS-\d{4,5})\b/gi,
  /\b(SLPS-\d{3,5})\b/gi,
  /\b(SLES-\d{3,5})\b/gi,
  /\b(SLED-\d{3,5})\b/gi,
  /\b(SLUS-\d{3,5})\b/gi,
  /\b(SCPS-\d{3,5})\b/gi,
  /\b(SHVC-[A-Z0-9-]+)\b/gi,
  /\b(SNSP-[A-Z0-9-]+)\b/gi,
  /\b(SNS[A-Z]?-[A-Z0-9-]+)\b/gi,
  /\b(MK-\d+-\d+)\b/gi,
  /\b(NEO-[A-Z0-9-]+)\b/gi,
  /\b(NUS-[A-Z0-9-]+)\b/gi,
  /\b(DMG-[A-Z0-9-]+)\b/gi,
  /\b(HVC-[A-Z0-9-]+)\b/gi,
];

const PLATFORM_REF_LABEL: Record<string, string> = {
  megadrive: "Código producto Sega",
  mastersystem: "Código producto Sega",
  gamegear: "Código producto Sega",
  megacd: "Código producto Sega CD",
  sega32x: "Código producto Sega",
  saturn: "Código producto Saturn",
  dreamcast: "Código producto Dreamcast",
  nes: "Código producto NES",
  snes: "Código cartucho SNES",
  n64: "Código producto N64",
  gameboy: "Código producto Game Boy",
  gamecube: "Código producto GameCube",
  wii: "Código producto Wii",
  ds: "Código producto Nintendo DS",
  "3ds": "Código producto Nintendo 3DS",
  ps1: "SKU PlayStation",
  ps2: "SKU PlayStation 2",
  ps3: "SKU PlayStation 3",
  ps4: "SKU PlayStation 4",
  neogeo: "Código producto Neo Geo",
  neogeocd: "Código producto Neo Geo CD",
  neogeopocket: "Código producto Neo Geo Pocket",
};

export type ProductReferenceInfo = {
  raw: string;
  normalized: string;
  label: string;
  family: string | null;
  regionHint: string | null;
  regionHintNote: string | null;
  searchTokens: string[];
};

export function cleanReferenceRaw(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const stripped = raw
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped || stripped.length < 2) return null;
  return stripped;
}

export function normalizeReference(ref: string): string {
  return ref.replace(/\s+/g, "").toUpperCase();
}

export function extractReferencesFromText(text: string): string[] {
  if (!text.trim()) return [];
  const found = new Set<string>();
  for (const pattern of REFERENCE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const norm = normalizeReference(String(match[1] ?? match[0]));
      if (norm.length >= 3) found.add(norm);
    }
  }
  return [...found];
}

export function referenceFieldLabel(platformSlug: string): string {
  return PLATFORM_REF_LABEL[platformSlug] ?? "Referencia / SKU producto";
}

export function interpretReference(
  ref: string,
  platformSlug: string,
): { regionHint: string; note: string } | null {
  const r = normalizeReference(ref);
  if (!r) return null;

  if (/^CUSA-/i.test(r)) {
    return { regionHint: "PAL Europa", note: "CUSA: SKU PlayStation 4 (habitual en edición europea)." };
  }
  if (/^BLES-/i.test(r)) {
    return { regionHint: "PAL Europa", note: "BLES: SKU PlayStation 3 PAL Europa." };
  }
  if (/^BLUS-/i.test(r)) {
    return { regionHint: "USA", note: "BLUS: SKU PlayStation 3 USA." };
  }
  if (/^BLJM-/i.test(r)) {
    return { regionHint: "Japón", note: "BLJM: SKU PlayStation 3 Japón." };
  }
  if (/^HDR-/i.test(r)) {
    return { regionHint: "Japón", note: "Prefijo HDR: catálogo Sega Japón (Dreamcast/Saturn)." };
  }
  if (/^T-\d+[GM]$/i.test(r)) {
    return { regionHint: "Japón", note: "Código T-…G/M: edición japonesa Sega (cartucho/CD)." };
  }
  if (/^T-\d+D-/i.test(r) || (/^T-/i.test(r) && /-\d{2}$/.test(r))) {
    return { regionHint: "PAL Europa", note: "Código T-…D o sufijo -50/-61: edición PAL europea Sega." };
  }
  if (/^T-\d+N$/i.test(r)) {
    return { regionHint: "USA", note: "Código T-…N: edición NTSC norteamericana Sega." };
  }
  if (/^MK-\d+-\d+$/i.test(r)) {
    return { regionHint: "PAL Europa", note: "Código MK-…-50: distribución PAL Europa (Sega/Nintendo)." };
  }
  if (/^SLPS-/i.test(r)) {
    return { regionHint: "Japón", note: "SLPS: catálogo PlayStation Japón." };
  }
  if (/^SCPS-/i.test(r)) {
    return { regionHint: "Japón", note: "SCPS: catálogo Sony Japón." };
  }
  if (/^SLES-/i.test(r) || /^SLED-/i.test(r)) {
    return { regionHint: "PAL Europa", note: "SLES/SLED: catálogo PlayStation PAL Europa." };
  }
  if (/^SLUS-/i.test(r)) {
    return { regionHint: "USA", note: "SLUS: catálogo PlayStation USA." };
  }
  if (/^SHVC-/i.test(r)) {
    return { regionHint: "Japón", note: "SHVC: cartucho Super Famicom (Japón)." };
  }
  if (/^SNS[A-Z]?-/i.test(r) && !/^SNSP-/i.test(r)) {
    return { regionHint: "Japón", note: "SNS-: nomenclatura Super Famicom / SNES Japón." };
  }
  if (/^SNSP-/i.test(r)) {
    return { regionHint: "PAL Europa", note: "SNSP-: cartucho SNES PAL." };
  }
  if (/^NUS-/i.test(r)) {
    return { regionHint: "PAL Europa", note: "NUS-: cartucho N64 (comprobar sufijo regional)." };
  }
  if (/^NEO-/i.test(r) && platformSlug.startsWith("neo")) {
    return { regionHint: "Japón", note: "NEO-: catálogo Neo Geo (edición Japón habitual)." };
  }

  return null;
}

function referenceFamily(normalized: string): string | null {
  const match = normalized.match(/^([A-Z]+)/);
  return match?.[1] ?? null;
}

function buildSearchTokens(raw: string, normalized: string, game: CatalogGame): string[] {
  const tokens = new Set<string>([
    raw,
    normalized,
    normalized.replace(/-/g, ""),
    ...extractReferencesFromText(raw),
    ...extractReferencesFromText(normalized),
  ]);

  if (game.pcId != null) tokens.add(String(game.pcId));
  tokens.add(game.id);

  return [...tokens].filter(Boolean);
}

export function getGameProductReference(
  game: CatalogGame,
  details?: GameDetails | null,
): ProductReferenceInfo | null {
  const raw = cleanReferenceRaw(details?.reference);
  if (!raw) return null;

  const normalized = normalizeReference(raw);
  const parsed = interpretReference(normalized, game.platformSlug);

  return {
    raw,
    normalized,
    label: referenceFieldLabel(game.platformSlug),
    family: referenceFamily(normalized),
    regionHint: parsed?.regionHint ?? null,
    regionHintNote: parsed?.note ?? "Código impreso en carátula, cartucho, disco o contraportada.",
    searchTokens: buildSearchTokens(raw, normalized, game),
  };
}

export function referenceSearchHaystack(game: CatalogGame, details?: GameDetails | null): string {
  const info = getGameProductReference(game, details);
  const platform = getPlatform(game.platformSlug);
  const parts = [
    info?.raw,
    info?.normalized,
    info?.normalized.replace(/-/g, ""),
    ...(info?.searchTokens ?? []),
    info?.family,
    info?.label,
    platform?.name,
    platform?.shortName,
    "sku",
    "referencia",
    "cusa",
    "sles",
    "slus",
  ];
  return parts.filter(Boolean).join(" ");
}

export function referenceSortKey(game: CatalogGame, details?: GameDetails | null): string {
  return getGameProductReference(game, details)?.normalized.toLowerCase() ?? game.slug;
}
