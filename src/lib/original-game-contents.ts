export const ORIGINAL_GAME_CONTENT_KEYS = [
  "manual",
  "map",
  "poster",
  "stickers",
  "soundtrack",
  "artbook",
  "cards",
  "steelbook",
  "bonus_disc",
  "figure",
] as const;

export type OriginalGameContentKey = (typeof ORIGINAL_GAME_CONTENT_KEYS)[number];

export const ORIGINAL_GAME_CONTENT_LABELS: Record<OriginalGameContentKey, string> = {
  manual: "Manual",
  map: "Mapa",
  poster: "Póster",
  stickers: "Pegatinas",
  soundtrack: "Banda sonora",
  artbook: "Libro de arte",
  cards: "Tarjetas",
  steelbook: "Steelbook",
  bonus_disc: "Disco extra",
  figure: "Figura",
};

const ORIGINAL_GAME_CONTENT_KEY_SET = new Set<string>(ORIGINAL_GAME_CONTENT_KEYS);

export const LEGACY_MANUAL_PLATFORMS = new Set([
  "nes",
  "snes",
  "n64",
  "gameboy",
  "gamecube",
  "wii",
  "ds",
  "mastersystem",
  "megadrive",
  "sega32x",
  "megacd",
  "saturn",
  "dreamcast",
  "gamegear",
  "neogeo",
  "neogeo-aes-plus",
  "neogeocd",
  "neogeopocket",
  "ps1",
  "ps2",
  "psp",
  "gba",
  "xbox",
]);

export function normalizeOriginalGameContents(value: unknown): OriginalGameContentKey[] {
  if (!Array.isArray(value)) return [];
  const found = new Set<OriginalGameContentKey>();
  for (const item of value) {
    const key = typeof item === "string" ? item.trim().toLowerCase() : "";
    if (ORIGINAL_GAME_CONTENT_KEY_SET.has(key)) {
      found.add(key as OriginalGameContentKey);
    }
  }
  return ORIGINAL_GAME_CONTENT_KEYS.filter((key) => found.has(key));
}

type OriginalContentCarrier = {
  platformSlug?: string | null;
  manualExpected?: boolean | null;
  originalContents?: string[] | null;
  originalContentsSource?: string | null;
};

export function resolveOriginalGameContents(game: OriginalContentCarrier): {
  contents: OriginalGameContentKey[];
  source: string;
  explicit: boolean;
} {
  if (Array.isArray(game.originalContents)) {
    return {
      contents: normalizeOriginalGameContents(game.originalContents),
      source: game.originalContentsSource?.trim() || "catalog_verified",
      explicit: true,
    };
  }

  if (game.manualExpected === true) {
    return { contents: ["manual"], source: "manual_expected", explicit: true };
  }
  if (game.manualExpected === false) {
    return { contents: [], source: "manual_not_expected", explicit: true };
  }
  if (LEGACY_MANUAL_PLATFORMS.has((game.platformSlug ?? "").trim().toLowerCase())) {
    return { contents: ["manual"], source: "platform_generation_default", explicit: false };
  }
  return { contents: [], source: "unknown", explicit: false };
}
