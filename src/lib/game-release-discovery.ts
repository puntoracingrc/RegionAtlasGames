export type GameReleaseDiscoveryPlatform = "ps5" | "switch2";
export type GameReleaseCatalogStatus = "new" | "possible_duplicate";

export type GameReleaseDiscoveryMatch = {
  catalogId: string;
  title: string;
  region: string;
  score: number;
};

export type GameReleaseDiscoveryCandidate = {
  title: string;
  platformSlug: GameReleaseDiscoveryPlatform;
  region: "PAL España";
  releaseDate: string;
  year: number;
  sourceSku: string;
  productUrl: string;
  imageUrl: string | null;
  publisher: string | null;
  genres: string[];
  pegi: number | null;
  catalogStatus: GameReleaseCatalogStatus;
  matches: GameReleaseDiscoveryMatch[];
};

export type GameReleaseDiscoveryResult = {
  source: "game-es-release-discovery";
  mode: "released_catalog_candidates";
  containsPrices: false;
  platformSlug: GameReleaseDiscoveryPlatform;
  region: "PAL España";
  collectedAt: string;
  asOf: string;
  candidates: GameReleaseDiscoveryCandidate[];
  stats: {
    pages: number;
    rawProducts: number;
    totalResults: number | null;
    totalPages: number | null;
    catalogGames: number;
    previouslySeen: number;
    candidates: number;
    possibleDuplicates: number;
    existing: number;
    seenBefore: number;
    rejected: number;
    repeatStopCount: number;
    consecutiveKnownAtStop: number;
    stopReason: string;
  };
};

type GameReleaseCatalogEntity = { name: string; slug: string };

const GAME_GENRES: Record<string, GameReleaseCatalogEntity[]> = {
  ACCION: [{ name: "Acción", slug: "action" }],
  AVENTURA: [{ name: "Aventura", slug: "adventure" }],
  ROL: [{ name: "RPG", slug: "rpg" }],
  SIMULADOR: [{ name: "Simulación", slug: "simulation" }],
  CONDUCCION: [{ name: "Carreras", slug: "racing" }],
  "SURVIVA-HORROR": [{ name: "Terror", slug: "horror" }],
  ARCADE: [{ name: "Arcade", slug: "arcade" }],
  LUCHA: [{ name: "Lucha", slug: "fighting" }],
  ESTRATEGIA: [{ name: "Estrategia", slug: "strategy" }],
  SHOOTER: [{ name: "Shooter", slug: "shooter" }],
  DEPORTES: [{ name: "Deportes", slug: "sports" }],
  "AVENTURA-GRAFICA": [{ name: "Aventura", slug: "adventure" }],
  MUSICA: [{ name: "Música", slug: "music" }],
  PLATAFORMAS: [{ name: "Plataformas", slug: "platformer" }],
  "ACCION-ESTRATEGIA": [
    { name: "Acción", slug: "action" },
    { name: "Estrategia", slug: "strategy" },
  ],
  "PLATAFORMA-AVENTURA": [
    { name: "Plataformas", slug: "platformer" },
    { name: "Aventura", slug: "adventure" },
  ],
  INFANTIL: [{ name: "Niños", slug: "ninos" }],
  PUZZLE: [{ name: "Puzzle", slug: "puzzle" }],
  SANDBOX: [{ name: "Aventura", slug: "adventure" }],
  HABILIDAD: [{ name: "Habilidad", slug: "habilidad" }],
  "MINI-JUEGOS": [{ name: "Party", slug: "party" }],
  UTILIDAD: [{ name: "Varios", slug: "other" }],
};

const GAME_PUBLISHER_ALIASES: Record<string, GameReleaseCatalogEntity> = {
  bnee: { name: "Bandai Namco Entertainment", slug: "bandai-namco-entertainment" },
  "bolt-production": { name: "Bolt Production", slug: "bolt-production" },
  "cd-projekt": { name: "CD Projekt RED", slug: "cd-projekt-red" },
  "coffe-stain": { name: "Coffee Stain Publishing", slug: "coffee-stain-publishing" },
  creative: { name: "Creative", slug: "creative" },
  curveball: { name: "Curveball", slug: "curveball" },
  "elec-arts": { name: "Electronic Arts", slug: "electronic-arts" },
  "far-out": { name: "Far Out", slug: "far-out" },
  flashpoint: { name: "Flashpoint", slug: "flashpoint" },
  "focus-home-int": { name: "Focus Home Interactive", slug: "focus-home-interactive" },
  funboxmedia: { name: "Funbox Media", slug: "funbox-media" },
  giants: { name: "GIANTS Software", slug: "giants-software" },
  meridiem: { name: "Meridiem Games", slug: "meridiem-games" },
  nejcraft: { name: "NEJCRAFT", slug: "nejcraft" },
  nighthawk: { name: "Nighthawk Interactive", slug: "nighthawk-interactive" },
  numskull: { name: "Numskull Games Ltd.", slug: "numskull-games" },
  outright: { name: "Outright Games LTD", slug: "outright-games" },
  paradox: { name: "Paradox Interactive", slug: "paradox-interactive" },
  "pix-n-love-games": { name: "Pix 'n Love Games", slug: "pix-39-n-love-games" },
  "red-art": { name: "Red Art Games", slug: "red-art-games" },
  selecta: { name: "Selecta Play", slug: "selecta-play" },
  "silver-lining": { name: "Silver Lining", slug: "silver-lining" },
  "straight4-studios": { name: "Straight4 Studios", slug: "straight4-studios" },
  strictly: { name: "Strictly Limited Games", slug: "strictly-limited-games" },
  sunblink: { name: "Sunblink", slug: "sunblink" },
  tripwire: { name: "Tripwire Interactive", slug: "tripwire-interactive" },
  "vea-games": { name: "VEA Games", slug: "vea-games" },
};

function sourceSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function gameReleaseGenres(values: string[]): GameReleaseCatalogEntity[] {
  const unique = new Map<string, GameReleaseCatalogEntity>();
  for (const entity of values.flatMap((value) => GAME_GENRES[value.trim().toUpperCase()] ?? [])) {
    unique.set(entity.slug, entity);
  }
  return [...unique.values()];
}

export function gameReleaseGenreNames(values: string[]): string[] {
  return gameReleaseGenres(values).map((entity) => entity.name);
}

export function gameReleaseGenreSlug(name: string): string | null {
  return Object.values(GAME_GENRES).flat().find((entity) => entity.name === name)?.slug ?? null;
}

export function gameReleasePublisher(value: string | null): GameReleaseCatalogEntity | null {
  const name = value?.trim();
  if (!name) return null;
  return GAME_PUBLISHER_ALIASES[sourceSlug(name)] ?? { name, slug: sourceSlug(name) };
}

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanNumber(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

function trustedUrl(value: unknown, allowedHosts: Set<string>): string | null {
  const raw = cleanString(value, 2_000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !allowedHosts.has(url.hostname.toLowerCase())) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeMatch(value: unknown): GameReleaseDiscoveryMatch | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const catalogId = cleanString(raw.catalogId, 240);
  const title = cleanString(raw.title, 240);
  if (!catalogId || !title) return null;
  return {
    catalogId,
    title,
    region: cleanString(raw.region, 80),
    score: cleanNumber(raw.score, 0, 1),
  };
}

function normalizeCandidate(
  value: unknown,
  expectedPlatform: GameReleaseDiscoveryPlatform,
): GameReleaseDiscoveryCandidate | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const title = cleanString(raw.title, 240);
  const sourceSku = cleanString(raw.sourceSku, 80);
  const releaseDate = cleanString(raw.releaseDate, 10);
  const platformSlug = raw.platformSlug === "switch2" ? "switch2" : raw.platformSlug === "ps5" ? "ps5" : null;
  const productUrl = trustedUrl(raw.productUrl, new Set(["www.game.es", "game.es"]));
  const catalogStatus = raw.catalogStatus === "possible_duplicate" ? "possible_duplicate" : raw.catalogStatus === "new" ? "new" : null;
  if (!title || !sourceSku || !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate) || platformSlug !== expectedPlatform || !productUrl || !catalogStatus) {
    return null;
  }
  const imageUrl = trustedUrl(raw.imageUrl, new Set(["media.game.es"]));
  const matches = Array.isArray(raw.matches)
    ? raw.matches.map(normalizeMatch).filter((match): match is GameReleaseDiscoveryMatch => Boolean(match)).slice(0, 3)
    : [];
  return {
    title,
    platformSlug,
    region: "PAL España",
    releaseDate,
    year: cleanNumber(raw.year, 1950, 2100),
    sourceSku,
    productUrl,
    imageUrl,
    publisher: cleanString(raw.publisher, 160) || null,
    genres: Array.isArray(raw.genres)
      ? raw.genres.map((genre) => cleanString(genre, 80)).filter(Boolean).slice(0, 12)
      : [],
    pegi: [3, 7, 12, 16, 18].includes(Number(raw.pegi)) ? Number(raw.pegi) : null,
    catalogStatus,
    matches,
  };
}

export function normalizeGameReleaseDiscoveryResult(value: unknown): GameReleaseDiscoveryResult | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.source !== "game-es-release-discovery" || raw.mode !== "released_catalog_candidates" || raw.containsPrices !== false) {
    return null;
  }
  const platformSlug: GameReleaseDiscoveryPlatform | null = raw.platformSlug === "switch2" ? "switch2" : raw.platformSlug === "ps5" ? "ps5" : null;
  if (!platformSlug || !Array.isArray(raw.candidates)) return null;
  const candidates = raw.candidates
    .map((candidate) => normalizeCandidate(candidate, platformSlug))
    .filter((candidate): candidate is GameReleaseDiscoveryCandidate => Boolean(candidate))
    .slice(0, 200);
  const rawStats = raw.stats && typeof raw.stats === "object" ? raw.stats as Record<string, unknown> : {};

  return {
    source: "game-es-release-discovery",
    mode: "released_catalog_candidates",
    containsPrices: false,
    platformSlug,
    region: "PAL España",
    collectedAt: cleanString(raw.collectedAt, 40),
    asOf: cleanString(raw.asOf, 10),
    candidates,
    stats: {
      pages: cleanNumber(rawStats.pages, 0, 50),
      rawProducts: cleanNumber(rawStats.rawProducts, 0, 10_000),
      totalResults: rawStats.totalResults == null ? null : cleanNumber(rawStats.totalResults, 0, 1_000_000),
      totalPages: rawStats.totalPages == null ? null : cleanNumber(rawStats.totalPages, 0, 10_000),
      catalogGames: cleanNumber(rawStats.catalogGames, 0, 1_000_000),
      previouslySeen: cleanNumber(rawStats.previouslySeen, 0, 1_000_000),
      candidates: candidates.length,
      possibleDuplicates: candidates.filter((candidate) => candidate.catalogStatus === "possible_duplicate").length,
      existing: cleanNumber(rawStats.existing, 0, 1_000_000),
      seenBefore: cleanNumber(rawStats.seenBefore, 0, 1_000_000),
      rejected: cleanNumber(rawStats.rejected, 0, 1_000_000),
      repeatStopCount: cleanNumber(rawStats.repeatStopCount, 0, 20),
      consecutiveKnownAtStop: cleanNumber(rawStats.consecutiveKnownAtStop, 0, 20),
      stopReason: cleanString(rawStats.stopReason, 80) || "unknown",
    },
  };
}
