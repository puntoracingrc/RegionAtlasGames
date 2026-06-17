import type { AdminAiFillEvent, AdminGameDraft } from "./admin-draft-types";
import { getPlatform } from "./catalog";
import { slugify } from "./slug";
import { cleanSupportLabel, defaultSupportForPlatform } from "./game-detail-display";

export type AdminAiFillOptions = {
  onlyMissing?: boolean;
  includeMetadata?: boolean;
  includeDescription?: boolean;
  manualUrl?: string;
  extraInstructions?: string;
};

const PLATFORM_WIKI_HINT: Record<string, string> = {
  nes: "NES",
  snes: "Super Nintendo",
  n64: "Nintendo 64",
  gameboy: "Game Boy",
  gamecube: "GameCube",
  wii: "Wii",
  ds: "Nintendo DS",
  "3ds": "Nintendo 3DS",
  megadrive: "Mega Drive",
  sega32x: "Sega 32X",
  megacd: "Mega CD",
  mastersystem: "Master System",
  saturn: "Sega Saturn",
  dreamcast: "Dreamcast",
  gamegear: "Game Gear",
  neogeo: "Neo Geo",
  neogeocd: "Neo Geo CD",
  neogeopocket: "Neo Geo Pocket",
  ps1: "PlayStation",
  ps2: "PlayStation 2",
  ps3: "PlayStation 3",
  ps4: "PlayStation 4",
  ps5: "PlayStation 5",
};

const USER_AGENT = "RegionAtlasGames/1.0 (admin ai fill)";

type ReferenceSource = {
  label: string;
  url: string;
  text: string;
  title?: string | null;
  sku?: string | null;
  coverUrl?: string | null;
  platforms?: string[];
  publisherName?: string | null;
  releaseDate?: string | null;
  genres?: string[];
  players?: number | null;
};

type PlayStationProduct = {
  id?: string;
  name?: string;
  npTitleId?: string;
  publisherName?: string;
  releaseDate?: string;
  localizedStoreDisplayClassification?: string;
  platforms?: string[];
  genres?: Array<string | { value?: string }>;
  localizedGenres?: Array<string | { value?: string }>;
  price?: { basePrice?: string; discountedPrice?: string };
  media?: Array<{ role?: string; type?: string; url?: string }>;
};

function parsePlayerCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.trunc(value);
  if (typeof value !== "string") return null;
  const match = value.match(/\b([1-9]\d?)\b/);
  if (!match) return null;
  const count = Number.parseInt(match[1], 10);
  return Number.isFinite(count) && count > 0 ? count : null;
}

function findPlayerCountInPayload(payload: unknown): number | null {
  const seen = new WeakSet<object>();
  const visit = (value: unknown): number | null => {
    if (!value || typeof value !== "object") return null;
    if (seen.has(value)) return null;
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item);
        if (found) return found;
      }
      return null;
    }

    const record = value as Record<string, unknown>;
    for (const [key, item] of Object.entries(record)) {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey.includes("player") ||
        normalizedKey.includes("jugador") ||
        normalizedKey.includes("players")
      ) {
        const parsed = parsePlayerCount(item);
        if (parsed) return parsed;
      }
    }

    for (const item of Object.values(record)) {
      const found = visit(item);
      if (found) return found;
    }
    return null;
  };

  return visit(payload);
}

const PLAYSTATION_STORE_PLATFORM: Record<string, string> = {
  ps4: "PS4",
  ps5: "PS5",
};

const PLAYSTATION_OFFICIAL_INDEX: Record<string, string> = {
  ps4: "https://www.playstation.com/es-es/ps4/ps4-games/",
  ps5: "https://www.playstation.com/es-es/ps5/games/",
};

const NINTENDO_OFFICIAL_INDEX: Record<string, string> = {
  switch: "https://store.nintendo.com/es-es/games/view-all-games/shop-by-console/nintendo-switch-games",
  switch2: "https://store.nintendo.com/es-es/games/nintendo-switch-2-games",
};

const XBOX_OFFICIAL_INDEX = "https://www.xbox.com/es-es/games";

type TrustedSearchResult = {
  title: string;
  url: string;
  snippet: string;
  source: string;
  score: number;
};

const TRUSTED_SOURCE_PRIORITY: Array<{ domain: string; label: string; platformPrefixes?: string[]; score: number }> = [
  { domain: "store.playstation.com", label: "PlayStation Store", platformPrefixes: ["ps"], score: 100 },
  { domain: "xbox.com", label: "Xbox Store", platformPrefixes: ["xbox"], score: 95 },
  { domain: "microsoft.com", label: "Microsoft Store", platformPrefixes: ["xbox"], score: 90 },
  { domain: "store.nintendo.com", label: "Nintendo Store", platformPrefixes: ["switch"], score: 100 },
  { domain: "nintendo.com", label: "Nintendo oficial", platformPrefixes: ["switch", "wii", "ds", "3ds"], score: 95 },
  { domain: "store.steampowered.com", label: "Steam", platformPrefixes: ["pc"], score: 95 },
  { domain: "sega.com", label: "SEGA oficial", score: 88 },
  { domain: "snk-corp.co.jp", label: "SNK oficial", score: 88 },
  { domain: "bandainamcoent.eu", label: "Bandai Namco oficial", score: 88 },
  { domain: "bandainamcoent.com", label: "Bandai Namco oficial", score: 86 },
  { domain: "capcom-games.com", label: "Capcom oficial", score: 88 },
  { domain: "square-enix-games.com", label: "Square Enix oficial", score: 88 },
  { domain: "konami.com", label: "Konami oficial", score: 86 },
  { domain: "ubisoft.com", label: "Ubisoft oficial", score: 86 },
  { domain: "ea.com", label: "EA oficial", score: 86 },
  { domain: "2k.com", label: "2K oficial", score: 84 },
  { domain: "rockstargames.com", label: "Rockstar Games oficial", score: 86 },
  { domain: "atlus.com", label: "Atlus oficial", score: 84 },
  { domain: "505games.com", label: "505 Games oficial", score: 82 },
  { domain: "focus-entmt.com", label: "Focus Entertainment oficial", score: 82 },
  { domain: "devolverdigital.com", label: "Devolver Digital oficial", score: 82 },
  { domain: "team17.com", label: "Team17 oficial", score: 82 },
  { domain: "thqnordic.com", label: "THQ Nordic oficial", score: 82 },
  { domain: "microids.com", label: "Microids oficial", score: 80 },
  { domain: "maximum-ent.com", label: "Maximum Entertainment oficial", score: 80 },
  { domain: "indiegames-studio.com", label: "Web oficial del estudio", score: 74 },
  { domain: "mobygames.com", label: "MobyGames", score: 82 },
  { domain: "thegamesdb.net", label: "TheGamesDB", score: 76 },
  { domain: "igdb.com", label: "IGDB", score: 74 },
  { domain: "wikipedia.org", label: "Wikipedia", score: 62 },
  { domain: "wikidata.org", label: "Wikidata", score: 62 },
];

const MODERN_CATALOG_PLATFORMS = new Set([
  "ps4",
  "ps5",
  "switch",
  "switch2",
  "xboxone",
  "xboxseriesx",
  "xboxseriess",
  "pc",
]);

const RETRO_REFERENCE_DOMAINS = ["mobygames.com", "thegamesdb.net", "igdb.com", "wikipedia.org", "wikidata.org"];

const COMPANY_DOMAIN_HINTS: Record<string, string[]> = {
  sega: ["sega.com"],
  nintendo: ["nintendo.com", "store.nintendo.com"],
  snk: ["snk-corp.co.jp"],
  playstation: ["playstation.com", "store.playstation.com"],
  sony: ["playstation.com", "store.playstation.com"],
  xbox: ["xbox.com", "microsoft.com"],
  microsoft: ["xbox.com", "microsoft.com"],
  "bandai namco": ["bandainamcoent.eu", "bandainamcoent.com"],
  capcom: ["capcom-games.com"],
  "square enix": ["square-enix-games.com"],
  konami: ["konami.com"],
  ubisoft: ["ubisoft.com"],
  "electronic arts": ["ea.com"],
  ea: ["ea.com"],
  "2k": ["2k.com"],
  rockstar: ["rockstargames.com"],
  atlus: ["atlus.com"],
  "505 games": ["505games.com"],
  "focus entertainment": ["focus-entmt.com"],
  devolver: ["devolverdigital.com"],
  team17: ["team17.com"],
  "thq nordic": ["thqnordic.com"],
  microids: ["microids.com"],
};

function descriptionModel(): string {
  return (
    process.env.GAME_DESCRIPTION_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4o-mini"
  );
}

function openAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function missingOpenAiMessage(): string {
  return (
    "La IA no está activa en este entorno porque falta la clave de OpenAI. " +
    "Ya puedes seguir editando manualmente; para usar este botón hay que configurar OPENAI_API_KEY y redeplegar."
  );
}

function normalizeMatchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function platformSearchLabel(platformSlug: string): string {
  return PLAYSTATION_STORE_PLATFORM[platformSlug] ?? PLATFORM_WIKI_HINT[platformSlug] ?? platformSlug;
}

function trustedSourceForUrl(url: string, platformSlug: string): { label: string; score: number } | null {
  let hostname = "";
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }

  const source = TRUSTED_SOURCE_PRIORITY.find((candidate) => {
    if (!hostname.endsWith(candidate.domain)) return false;
    return !candidate.platformPrefixes || candidate.platformPrefixes.some((prefix) => platformSlug.startsWith(prefix));
  });
  return source ? { label: source.label, score: source.score } : null;
}

function webSearchConfigured(): boolean {
  return Boolean(
    (process.env.GOOGLE_SEARCH_API_KEY?.trim() && process.env.GOOGLE_SEARCH_CX?.trim()) ||
      process.env.SERPAPI_KEY?.trim(),
  );
}

function isModernCatalogPlatform(platformSlug: string): boolean {
  return MODERN_CATALOG_PLATFORMS.has(platformSlug);
}

function companySearchDomains(draft: AdminGameDraft): string[] {
  const names = [draft.developerName, draft.publisherName]
    .filter((name): name is string => Boolean(name?.trim()))
    .map(normalizeMatchText);
  const domains = new Set<string>();

  for (const name of names) {
    for (const [company, companyDomains] of Object.entries(COMPANY_DOMAIN_HINTS)) {
      if (name.includes(normalizeMatchText(company))) {
        companyDomains.forEach((domain) => domains.add(domain));
      }
    }
  }

  return Array.from(domains);
}

function buildTrustedSearchQueries(draft: AdminGameDraft): string[] {
  const platformLabel = platformSearchLabel(draft.platformSlug);
  const base = `"${draft.title}" ${platformLabel}`;
  const queries = new Set<string>();

  if (isModernCatalogPlatform(draft.platformSlug)) {
    if (draft.platformSlug === "ps5") {
      queries.add(`${base} site:store.playstation.com`);
      queries.add(`${base} site:${new URL(PLAYSTATION_OFFICIAL_INDEX.ps5).hostname}${new URL(PLAYSTATION_OFFICIAL_INDEX.ps5).pathname}`);
    } else if (draft.platformSlug === "ps4") {
      queries.add(`${base} site:store.playstation.com`);
      queries.add(`${base} site:${new URL(PLAYSTATION_OFFICIAL_INDEX.ps4).hostname}${new URL(PLAYSTATION_OFFICIAL_INDEX.ps4).pathname}`);
    } else if (draft.platformSlug === "switch2") {
      queries.add(`${base} site:${new URL(NINTENDO_OFFICIAL_INDEX.switch2).hostname}${new URL(NINTENDO_OFFICIAL_INDEX.switch2).pathname}`);
      queries.add(`${base} site:nintendo.com/es-es`);
    } else if (draft.platformSlug === "switch") {
      queries.add(`${base} site:${new URL(NINTENDO_OFFICIAL_INDEX.switch).hostname}${new URL(NINTENDO_OFFICIAL_INDEX.switch).pathname}`);
      queries.add(`${base} site:nintendo.com/es-es`);
    } else if (draft.platformSlug.startsWith("xbox")) {
      queries.add(`${base} site:${new URL(XBOX_OFFICIAL_INDEX).hostname}${new URL(XBOX_OFFICIAL_INDEX).pathname}`);
      queries.add(`${base} site:microsoft.com/es-es/store`);
    }

    for (const domain of companySearchDomains(draft)) {
      queries.add(`${base} site:${domain}`);
    }
    queries.add(`${base} official game developer publisher`);
  } else {
    for (const domain of RETRO_REFERENCE_DOMAINS) {
      queries.add(`${base} site:${domain}`);
    }
  }

  if (isModernCatalogPlatform(draft.platformSlug)) {
    queries.add(`${base} site:mobygames.com`);
    queries.add(`${base} site:thegamesdb.net`);
    queries.add(`${base} site:igdb.com`);
  }

  return Array.from(queries).slice(0, 8);
}

function psStoreProductUrlFromReference(reference: string | null): string | null {
  if (!reference) return null;
  const trimmed = reference.trim();
  if (/^https:\/\/store\.playstation\.com\//i.test(trimmed)) return trimmed;
  const productId = trimmed.match(/[A-Z]{2}\d{4}-[A-Z0-9_]+/i)?.[0];
  if (!productId) return null;
  return `https://store.playstation.com/es-es/product/${productId.toUpperCase()}`;
}

function parseJsonScript(html: string, id: string): unknown | null {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<script id="${escapedId}" type="application/json">([\\s\\S]*?)<\\/script>`));
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as unknown;
  } catch {
    return null;
  }
}

function parseAllJsonScripts(html: string): unknown[] {
  const scripts = html.matchAll(/<script(?:[^>]*?)type="application\/json"(?:[^>]*?)>([\s\S]*?)<\/script>/g);
  const parsed: unknown[] = [];
  for (const script of scripts) {
    try {
      parsed.push(JSON.parse(script[1]) as unknown);
    } catch {
      continue;
    }
  }
  return parsed;
}

function parseProductJsonLd(html: string): Record<string, unknown> | null {
  const scripts = html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g);
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script[1]) as Record<string, unknown>;
      if (parsed["@type"] === "Product") return parsed;
    } catch {
      continue;
    }
  }
  return null;
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i",
  );
  return html.match(pattern)?.[1]?.trim() ?? null;
}

async function fetchManualReference(url: string): Promise<ReferenceSource | null> {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return null;

  if (parsed.hostname.endsWith("store.playstation.com")) {
    return fetchPlayStationProduct(parsed.toString());
  }

  const res = await fetch(parsed.toString(), { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const html = await res.text();
  const title =
    metaContent(html, "og:title") ??
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ??
    parsed.hostname;
  const description = metaContent(html, "og:description") ?? metaContent(html, "description");
  const text = stripHtmlToText(html).slice(0, 2400);
  const facts = [
    `URL aportada manualmente por admin: ${parsed.toString()}`,
    `Título página: ${title}`,
    description ? `Descripción página: ${description}` : null,
    text ? `Texto visible: ${text}` : null,
  ].filter(Boolean);

  return {
    label: `URL manual (${parsed.hostname.replace(/^www\./, "")})`,
    url: parsed.toString(),
    title,
    text: facts.join("\n"),
  };
}

function readApolloProducts(payload: unknown): PlayStationProduct[] {
  let apolloState: object | null = null;

  if (payload && typeof payload === "object") {
    if (
      "props" in payload &&
      payload.props &&
      typeof payload.props === "object" &&
      "apolloState" in payload.props &&
      payload.props.apolloState &&
      typeof payload.props.apolloState === "object"
    ) {
      apolloState = payload.props.apolloState;
    } else if ("cache" in payload && payload.cache && typeof payload.cache === "object") {
      apolloState = payload.cache;
    }
  }

  if (!apolloState) return [];
  return Object.values(apolloState)
    .filter((value): value is PlayStationProduct => {
      return (
        Boolean(value) &&
        typeof value === "object" &&
        "id" in value &&
        typeof value.id === "string" &&
        "name" in value &&
        typeof value.name === "string"
      );
    });
}

function mergePlayStationProducts(products: PlayStationProduct[], preferredId?: string | null): PlayStationProduct {
  const matching = preferredId
    ? products.filter((product) => product.id === preferredId)
    : products;
  return (matching.length > 0 ? matching : products).reduce<PlayStationProduct>((merged, product) => {
    return {
      ...merged,
      ...Object.fromEntries(
        Object.entries(product).filter(([, value]) => value !== undefined && value !== null),
      ),
      media: product.media?.length ? product.media : merged.media,
      platforms: product.platforms?.length ? product.platforms : merged.platforms,
      genres: product.genres?.length ? product.genres : product.localizedGenres?.length ? product.localizedGenres : merged.genres,
      localizedGenres: product.localizedGenres?.length ? product.localizedGenres : merged.localizedGenres,
    };
  }, {});
}

function normalizePlayStationGenres(genres: PlayStationProduct["genres"]): string[] {
  return (genres ?? [])
    .map((genre) => {
      if (typeof genre === "string") return genre;
      return typeof genre.value === "string" ? genre.value : "";
    })
    .map((genre) => genre.trim())
    .filter((genre): genre is string => genre.length > 0);
}

function preferredPsCover(product: PlayStationProduct, jsonLd: Record<string, unknown> | null): string | null {
  const roles = ["MASTER", "GAMEHUB_COVER_ART", "EDITION_KEY_ART", "PORTRAIT_BANNER"];
  for (const role of roles) {
    const media = product.media?.find((item) => item.type === "IMAGE" && item.role === role && item.url);
    if (media?.url) return media.url;
  }
  return typeof jsonLd?.image === "string" ? jsonLd.image : null;
}

async function fetchPlayStationProduct(url: string): Promise<ReferenceSource | null> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const html = await res.text();
  const jsonLd = parseProductJsonLd(html);
  const nextData = parseJsonScript(html, "__NEXT_DATA__");
  const jsonPayloads = [nextData, ...parseAllJsonScripts(html)].filter(Boolean);
  const productIdFromJsonLd = typeof jsonLd?.sku === "string" ? jsonLd.sku : null;
  const product = mergePlayStationProducts(
    jsonPayloads.flatMap((payload) => readApolloProducts(payload)),
    productIdFromJsonLd,
  );
  const name = typeof jsonLd?.name === "string" ? jsonLd.name : product.name;
  const description = typeof jsonLd?.description === "string" ? jsonLd.description : null;
  const sku = typeof jsonLd?.sku === "string" ? jsonLd.sku : product.id ?? null;
  if (!name || !sku) return null;

  const platforms = Array.isArray(product.platforms)
    ? product.platforms.filter((platform): platform is string => typeof platform === "string")
    : [];
  const classification =
    product.localizedStoreDisplayClassification ??
    (typeof jsonLd?.category === "string" ? jsonLd.category : null);
  const price =
    product.price?.discountedPrice ??
    product.price?.basePrice ??
    (jsonLd?.offers && typeof jsonLd.offers === "object" && "price" in jsonLd.offers
      ? String(jsonLd.offers.price)
      : null);
  const coverUrl = preferredPsCover(product, jsonLd);
  const genres = normalizePlayStationGenres(product.genres);
  const players = jsonPayloads.map(findPlayerCountInPayload).find((count): count is number => Boolean(count)) ?? null;
  const facts = [
    `Fuente oficial: PlayStation Store España.`,
    `Título: ${name}.`,
    `SKU/CUSA: ${sku}.`,
    product.npTitleId ? `NP Title ID: ${product.npTitleId}.` : null,
    platforms.length > 0 ? `Plataformas indicadas por PlayStation: ${platforms.join(", ")}.` : null,
    product.releaseDate ? `Fecha de lanzamiento: ${product.releaseDate}.` : null,
    product.publisherName ? `Editor indicado por PlayStation: ${product.publisherName}.` : null,
    genres.length ? `Géneros indicados por PlayStation: ${genres.join(", ")}.` : null,
    players ? `Jugadores indicados por PlayStation: ${players}.` : null,
    classification ? `Tipo: ${classification}.` : null,
    price ? `Precio mostrado: ${price}.` : null,
    description ? `Descripción oficial: ${description}` : null,
  ].filter(Boolean);

  return {
    label: "PlayStation Store",
    url,
    title: name,
    text: facts.join("\n"),
    sku,
    coverUrl,
    platforms,
    publisherName: product.publisherName ?? null,
    releaseDate: product.releaseDate ?? null,
    genres,
    players,
  };
}

function isSameGameTitle(expectedTitle: string, foundTitle: string | null | undefined): boolean {
  if (!foundTitle) return false;
  const expected = normalizeMatchText(expectedTitle);
  const found = normalizeMatchText(foundTitle);
  return found === expected || found.includes(expected) || expected.includes(found);
}

async function searchPlayStationStore(draft: AdminGameDraft): Promise<ReferenceSource | null> {
  if (!draft.platformSlug.startsWith("ps")) return null;

  const directUrl = psStoreProductUrlFromReference(draft.reference);
  if (directUrl) {
    const directProduct = await fetchPlayStationProduct(directUrl);
    return directProduct && isSameGameTitle(draft.title, directProduct.title) ? directProduct : null;
  }

  const platformHint = PLAYSTATION_STORE_PLATFORM[draft.platformSlug];
  const query = platformHint ? `${draft.title} ${platformHint}` : draft.title;
  const searchUrl = `https://store.playstation.com/es-es/search/${encodeURIComponent(query)}`;
  const res = await fetch(searchUrl, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;

  const html = await res.text();
  const nextData = parseJsonScript(html, "__NEXT_DATA__");
  const products = readApolloProducts(nextData);
  const wanted = normalizeMatchText(draft.title);
  const titleMatches = products.filter((product) => {
    if (!product.name) return false;
    const productName = normalizeMatchText(product.name);
    return productName === wanted || productName.includes(wanted);
  });
  const match =
    titleMatches.find((product) => platformHint && product.platforms?.includes(platformHint)) ??
    titleMatches[0];
  if (!match?.id) return null;

  const product = await fetchPlayStationProduct(`https://store.playstation.com/es-es/product/${match.id}`);
  return product && isSameGameTitle(draft.title, product.title) ? product : null;
}

async function googleTrustedSearch(query: string, platformSlug: string): Promise<TrustedSearchResult[]> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY?.trim();
  const cx = process.env.GOOGLE_SEARCH_CX?.trim();
  if (!apiKey || !cx) return [];

  const params = new URLSearchParams({
    key: apiKey,
    cx,
    q: query,
    num: "5",
    hl: "es",
    safe: "active",
  });
  const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    items?: Array<{ title?: string; link?: string; snippet?: string }>;
  };
  return (data.items ?? [])
    .map((item) => {
      const url = item.link ?? "";
      const source = trustedSourceForUrl(url, platformSlug);
      if (!item.title || !url || !source) return null;
      return {
        title: item.title,
        url,
        snippet: item.snippet ?? "",
        source: source.label,
        score: source.score,
      };
    })
    .filter((item): item is TrustedSearchResult => Boolean(item));
}

async function serpApiTrustedSearch(query: string, platformSlug: string): Promise<TrustedSearchResult[]> {
  const apiKey = process.env.SERPAPI_KEY?.trim();
  if (!apiKey) return [];

  const params = new URLSearchParams({
    engine: "google",
    api_key: apiKey,
    q: query,
    google_domain: "google.es",
    gl: "es",
    hl: "es",
    num: "5",
  });
  const res = await fetch(`https://serpapi.com/search.json?${params}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    organic_results?: Array<{ title?: string; link?: string; snippet?: string }>;
  };
  return (data.organic_results ?? [])
    .map((item) => {
      const url = item.link ?? "";
      const source = trustedSourceForUrl(url, platformSlug);
      if (!item.title || !url || !source) return null;
      return {
        title: item.title,
        url,
        snippet: item.snippet ?? "",
        source: source.label,
        score: source.score,
      };
    })
    .filter((item): item is TrustedSearchResult => Boolean(item));
}

async function trustedWebSearch(draft: AdminGameDraft): Promise<TrustedSearchResult[]> {
  if (!webSearchConfigured()) return [];

  const results: TrustedSearchResult[] = [];
  for (const query of buildTrustedSearchQueries(draft)) {
    const found =
      (await googleTrustedSearch(query, draft.platformSlug)).concat(
        await serpApiTrustedSearch(query, draft.platformSlug),
      );
    results.push(...found);
    if (results.length >= 5) break;
  }

  const wanted = normalizeMatchText(draft.title);
  const deduped = new Map<string, TrustedSearchResult>();
  for (const result of results) {
    const titleScore = normalizeMatchText(result.title).includes(wanted) ? 10 : 0;
    const snippetScore = normalizeMatchText(result.snippet).includes(wanted) ? 5 : 0;
    const previous = deduped.get(result.url);
    const scored = { ...result, score: result.score + titleScore + snippetScore };
    if (!previous || scored.score > previous.score) deduped.set(result.url, scored);
  }

  return Array.from(deduped.values()).sort((a, b) => b.score - a.score).slice(0, 5);
}

function referenceFromSearchResults(results: TrustedSearchResult[]): ReferenceSource | null {
  if (results.length === 0) return null;
  const lines = results.map((result, index) => {
    return `${index + 1}. ${result.source}: ${result.title}\nURL: ${result.url}\nResumen: ${result.snippet}`;
  });
  return {
    label: "Búsqueda web fiable",
    url: results[0].url,
    text: `Resultados fiables encontrados para contrastar:\n${lines.join("\n\n")}`,
  };
}

function hasSolidReference(referenceText: string | null, referenceUrl: string | null): boolean {
  return Boolean(referenceText && referenceUrl);
}

function hasEnoughExistingFacts(draft: AdminGameDraft): boolean {
  return Boolean(
    draft.year ||
      draft.developerName ||
      draft.publisherName ||
      draft.genreNames.length > 0 ||
      draft.reference,
  );
}

function yearFromIsoDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function hasReleaseDatePassed(value: string | null | undefined, now = new Date()): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() <= now.getTime();
}

function formatReferenceDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Madrid",
  }).format(date);
}

function normalizeCompanyDisplayName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed === trimmed.toUpperCase()) {
    return trimmed
      .toLocaleLowerCase("es")
      .replace(/\b[\p{L}\p{N}]/gu, (letter) => letter.toLocaleUpperCase("es"));
  }
  return trimmed;
}

async function searchWikipedia(title: string, platformSlug: string, lang: string) {
  const hint = PLATFORM_WIKI_HINT[platformSlug] ?? platformSlug;
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: `${title} ${hint} videojuego`,
    srlimit: "3",
    format: "json",
    origin: "*",
  });
  const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?${params}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    query?: { search?: Array<{ title: string }> };
  };
  return data.query?.search?.[0]?.title ?? null;
}

async function fetchWikiExtract(title: string, lang: string) {
  const params = new URLSearchParams({
    action: "query",
    prop: "extracts",
    explaintext: "1",
    exintro: "1",
    titles: title,
    format: "json",
    origin: "*",
  });
  const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?${params}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    query?: { pages?: Record<string, { extract?: string }> };
  };
  const pages = data.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  return page?.extract?.trim() || null;
}

async function openAiJson(system: string, user: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY no configurada");

  const base = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(
    /\/$/,
    "",
  );
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: descriptionModel(),
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 200)}`);
  }
  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = payload.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Respuesta vacía de OpenAI");
  return JSON.parse(raw) as Record<string, unknown>;
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const clipped = clean.slice(0, max);
  const lastSpace = clipped.lastIndexOf(" ");
  return (lastSpace > max / 2 ? clipped.slice(0, lastSpace) : clipped).replace(/[.,;:]$/, "") + "…";
}

function sanitizeGeneratedCatalogText(text: string, draft: AdminGameDraft): string {
  let clean = text.replace(/\s+/g, " ").trim();
  if (hasReleaseDatePassed(draft.releaseDate)) {
    clean = clean
      .replace(/\bse lanzará\b/gi, "se lanzó")
      .replace(/\bserá lanzado\b/gi, "fue lanzado")
      .replace(/\bserá publicado\b/gi, "fue publicado")
      .replace(/\btiene previsto lanzarse\b/gi, "se lanzó")
      .replace(/\bestará disponible\b/gi, "está disponible");
  }
  clean = clean
    .replace(/\bpor un precio de\s+\d+(?:[.,]\d+)?\s*(?:euros|€)\b\.?/gi, "")
    .replace(/\bprecio de\s+\d+(?:[.,]\d+)?\s*(?:euros|€)\b\.?/gi, "")
    .replace(/\bjuego completo de\b/gi, "juego de")
    .replace(/\buna experiencia única y envolvente\b/gi, "una propuesta narrativa")
    .replace(/\buna experiencia única\b/gi, "una propuesta propia")
    .replace(/\bexperiencia inmersiva\b/gi, "propuesta")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  return clean;
}

function normalizeAiGenreName(value: string): string {
  const name = value.trim();
  const key = name.toLowerCase();
  const dictionary: Record<string, string> = {
    action: "Acción",
    adventure: "Aventura",
    arcade: "Arcade",
    "interactive drama": "Drama interactivo",
    narrative: "Narrativa",
    "visual novel": "Novela visual",
    sports: "Deportes",
    racing: "Conducción",
    puzzle: "Puzzle",
    platformer: "Plataformas",
    shooter: "Shooter",
    simulation: "Simulación",
    strategy: "Estrategia",
    fighting: "Lucha",
    horror: "Terror",
  };
  return dictionary[key] ?? name;
}

export async function* streamAdminAiFill(
  draft: AdminGameDraft,
  options: AdminAiFillOptions = {},
): AsyncGenerator<AdminAiFillEvent> {
  const includeMetadata = options.includeMetadata !== false;
  const includeDescription = options.includeDescription !== false;
  const platform = getPlatform(draft.platformSlug);
  const platformName = platform?.name ?? draft.platformSlug;

  if (!openAiConfigured()) {
    yield {
      type: "error",
      message: missingOpenAiMessage(),
    };
    return;
  }

  let referenceText: string | null = null;
  let referenceUrl: string | null = null;
  let referenceLabel: string | null = null;

  const manualUrl = options.manualUrl?.trim();
  if (manualUrl) {
    yield { type: "log", message: `URL manual indicada: ${manualUrl}` };
    const manualReference = await fetchManualReference(manualUrl);
    if (manualReference) {
      referenceText = manualReference.text;
      referenceUrl = manualReference.url;
      referenceLabel = manualReference.label;
      yield { type: "log", message: `Fuente consultada: ${referenceLabel} · ${referenceUrl}` };
      if (!isSameGameTitle(draft.title, manualReference.title ?? draft.title)) {
        yield {
          type: "log",
          message: `Aviso: el título de la URL manual no coincide claramente (${manualReference.title ?? "sin título"}). Se usará igualmente porque la has indicado tú.`,
        };
      }
    } else {
      yield { type: "log", message: "No se pudo leer la URL manual. Se usará búsqueda automática." };
    }
  }

  if (!referenceText && draft.platformSlug.startsWith("ps")) {
    yield { type: "log", message: "Buscando fuente oficial en PlayStation Store…" };

    const psStoreReference = await searchPlayStationStore(draft);
    const expectedPsPlatform = PLAYSTATION_STORE_PLATFORM[draft.platformSlug];
    if (
      psStoreReference &&
      expectedPsPlatform &&
      psStoreReference.platforms &&
      psStoreReference.platforms.length > 0 &&
      !psStoreReference.platforms.includes(expectedPsPlatform)
    ) {
      yield {
        type: "log",
        message: `PlayStation Store encontró otra plataforma (${psStoreReference.platforms.join(", ")}), no se usará para esta ficha ${expectedPsPlatform}.`,
      };
    } else if (psStoreReference) {
      referenceText = psStoreReference.text;
      referenceUrl = psStoreReference.url;
      referenceLabel = psStoreReference.label;
      yield {
        type: "log",
        message: `Fuente oficial encontrada: ${psStoreReference.label}`,
      };
      yield { type: "log", message: `URL consultada: ${psStoreReference.url}` };
      if (psStoreReference.sku && (!options.onlyMissing || !draft.reference)) {
        draft.reference = psStoreReference.sku;
        yield { type: "field", field: "reference", value: draft.reference };
      }
      if (psStoreReference.coverUrl && (!options.onlyMissing || !draft.coverUrl)) {
        draft.coverUrl = psStoreReference.coverUrl;
        yield { type: "field", field: "coverUrl", value: draft.coverUrl };
      }
      if (psStoreReference.releaseDate && (!options.onlyMissing || !draft.releaseDate)) {
        draft.releaseDate = psStoreReference.releaseDate;
        yield { type: "field", field: "releaseDate", value: draft.releaseDate };
      }
      const releaseYear = yearFromIsoDate(psStoreReference.releaseDate);
      if (releaseYear && (!options.onlyMissing || draft.year == null)) {
        draft.year = releaseYear;
        yield { type: "field", field: "year", value: draft.year };
      } else if (releaseYear && draft.releaseDate) {
        draft.year = releaseYear;
        yield { type: "field", field: "year", value: draft.year };
      }
      if (psStoreReference.publisherName && (!options.onlyMissing || !draft.publisherName)) {
        draft.publisherName = normalizeCompanyDisplayName(psStoreReference.publisherName);
        draft.publisherSlug = slugify(draft.publisherName);
        yield { type: "field", field: "publisherName", value: draft.publisherName };
        yield { type: "field", field: "publisherSlug", value: draft.publisherSlug };
      }
      if (psStoreReference.genres?.length && (!options.onlyMissing || draft.genreNames.length === 0)) {
        draft.genreNames = psStoreReference.genres.slice(0, 4);
        yield { type: "field", field: "genres", value: draft.genreNames };
      }
      if (psStoreReference.players && (!options.onlyMissing || draft.players == null)) {
        draft.players = psStoreReference.players;
        yield { type: "field", field: "players", value: draft.players };
      }
      const platformSupport = defaultSupportForPlatform(draft.platformSlug);
      if (platformSupport && (!options.onlyMissing || !draft.support)) {
        draft.support = platformSupport;
        yield { type: "field", field: "support", value: draft.support };
      }
    }
  }

  if (!referenceText) {
    if (webSearchConfigured()) {
      yield {
        type: "log",
        message: isModernCatalogPlatform(draft.platformSlug)
          ? "Buscando fuentes oficiales y editoras/desarrolladoras en web…"
          : "Buscando fuentes retro/especializadas en web…",
      };
      const trustedResults = await trustedWebSearch(draft);
      const searchReference = referenceFromSearchResults(trustedResults);
      if (searchReference) {
        referenceText = searchReference.text;
        referenceUrl = searchReference.url;
        referenceLabel = searchReference.label;
        yield {
          type: "log",
          message: `Fuentes fiables encontradas: ${trustedResults.map((result) => result.source).join(", ")}`,
        };
        yield {
          type: "log",
          message: `URLs consultadas: ${trustedResults.map((result) => result.url).join(" · ")}`,
        };
      }
    } else {
      yield {
        type: "log",
        message: "Búsqueda web fiable no configurada; usando fuentes directas disponibles.",
      };
    }
  }

  if (!referenceText) {
    yield { type: "log", message: "Buscando referencia en Wikipedia (es)…" };

    for (const lang of ["es", "en"] as const) {
      const wikiTitle = await searchWikipedia(draft.title, draft.platformSlug, lang);
      if (!wikiTitle) continue;
      if (!isSameGameTitle(draft.title, wikiTitle)) continue;
      const extract = await fetchWikiExtract(wikiTitle, lang);
      if (extract && extract.length > 80) {
        referenceText = extract.slice(0, 1400);
        referenceUrl = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(wikiTitle.replace(/ /g, "_"))}`;
        referenceLabel = `Wikipedia (${lang.toUpperCase()})`;
        yield {
          type: "log",
          message: `Referencia encontrada: ${wikiTitle} (${lang.toUpperCase()})`,
        };
        yield { type: "log", message: `URL consultada: ${referenceUrl}` };
        break;
      }
    }
  }

  if (!hasSolidReference(referenceText, referenceUrl) && !hasEnoughExistingFacts(draft)) {
    yield {
      type: "error",
      message:
        "No hay fuente fiable ni metadatos suficientes para rellenar con IA. Añade una URL/SKU oficial o algunos datos básicos y vuelve a intentarlo.",
    };
    return;
  }

  if (!referenceText) {
    yield {
      type: "log",
      message: "Sin fuente externa clara; la IA usará solo metadatos ya existentes.",
    };
  }

  const knownReleaseYear = yearFromIsoDate(draft.releaseDate);
  if (knownReleaseYear && draft.year !== knownReleaseYear) {
    draft.year = knownReleaseYear;
    yield { type: "field", field: "year", value: draft.year };
  }
  const platformSupport = defaultSupportForPlatform(draft.platformSlug);
  if (
    platformSupport &&
    (!options.onlyMissing || !cleanSupportLabel(draft.support) || draft.support !== platformSupport)
  ) {
    draft.support = platformSupport;
    yield { type: "field", field: "support", value: draft.support };
  }

  const facts = {
    title: draft.title,
    platform: platformName,
    region: draft.region,
    reference: draft.reference,
    year: draft.year,
    releaseDate: draft.releaseDate,
    releaseDateFormatted: formatReferenceDate(draft.releaseDate),
    developer: draft.developerName,
    publisher: draft.publisherName,
    genres: draft.genreNames,
    source: referenceLabel,
    sourceUrl: referenceUrl,
  };

  if (includeMetadata) {
    yield { type: "log", message: "Extrayendo metadatos con IA…" };

    const metadataSystem =
      "Eres asistente de catálogo de videojuegos. Responde JSON con hechos verificables. " +
      "No inventes referencias SKU/CUSA si no las conoces con certeza. " +
      "Si la fuente no incluye un dato, devuelve null o cadena vacía; nunca uses frases genéricas como 'equipo talentoso' o 'reconocida compañía'. " +
      'Campos: {"year":number|null,"developer":"...","publisher":"...","genres":["..."],"players":number|null,"support":"..."}';
    const metadataUser =
      `Juego: ${draft.title}\nPlataforma: ${platformName}\nRegión: ${draft.region}\n` +
      `Referencia producto conocida: ${draft.reference ?? "ninguna"}\n\n` +
      `Fuente verificada:\n${referenceText ?? "(sin contexto externo)"}${
        options.extraInstructions?.trim()
          ? `\n\nInstrucciones extra del admin:\n${options.extraInstructions.trim().slice(0, 1200)}`
          : ""
      }`;

    try {
      const meta = await openAiJson(metadataSystem, metadataUser);
      if (
        typeof meta.year === "number" &&
        !draft.releaseDate &&
        (!options.onlyMissing || draft.year == null)
      ) {
        draft.year = meta.year;
        yield { type: "field", field: "year", value: meta.year };
      }
      if (
        typeof meta.developer === "string" &&
        meta.developer.trim() &&
        (!options.onlyMissing || !draft.developerName)
      ) {
        draft.developerName = meta.developer.trim();
        draft.developerSlug = slugify(draft.developerName);
        yield { type: "field", field: "developerName", value: draft.developerName };
        yield { type: "field", field: "developerSlug", value: draft.developerSlug };
      }
      if (
        typeof meta.publisher === "string" &&
        meta.publisher.trim() &&
        (!options.onlyMissing || !draft.publisherName)
      ) {
        draft.publisherName = meta.publisher.trim();
        draft.publisherSlug = slugify(draft.publisherName);
        yield { type: "field", field: "publisherName", value: draft.publisherName };
        yield { type: "field", field: "publisherSlug", value: draft.publisherSlug };
      }
      if (Array.isArray(meta.genres) && (!options.onlyMissing || draft.genreNames.length === 0)) {
        draft.genreNames = meta.genres
          .filter((g): g is string => typeof g === "string" && g.trim().length > 0)
          .map(normalizeAiGenreName)
          .slice(0, 4);
        yield { type: "field", field: "genres", value: draft.genreNames };
      }
      if (typeof meta.players === "number" && (!options.onlyMissing || draft.players == null)) {
        draft.players = meta.players;
        yield { type: "field", field: "players", value: meta.players };
      }
      const supportLabel = cleanSupportLabel(typeof meta.support === "string" ? meta.support : null);
      const platformSupport = defaultSupportForPlatform(draft.platformSlug);
      if (
        supportLabel &&
        !platformSupport &&
        (!options.onlyMissing || !cleanSupportLabel(draft.support))
      ) {
        draft.support = supportLabel;
        yield { type: "field", field: "support", value: draft.support };
      }
    } catch (error) {
      yield {
        type: "log",
        message: `Metadatos parciales: ${error instanceof Error ? error.message : "error"}`,
      };
    }
  }

  if (!includeDescription) {
    draft.updatedAt = new Date().toISOString();
    yield { type: "done", draft };
    return;
  }

  yield { type: "log", message: "Generando descripción y SEO…" };

  const descSystem =
    "Eres redactor SEO para Region Atlas (catálogo de videojuegos físico y digital). Textos ORIGINALES en español. " +
    "No copies Wikipedia ni tiendas oficiales, pero tampoco inventes datos. " +
    "Usa las fuentes solo como material de consulta: reescribe siempre con tus propias palabras. " +
    "Escribe solo con hechos presentes en HECHOS y REFERENCIA. " +
    "No menciones precios de tienda, descuentos ni disponibilidad comercial actual; Region Atlas separa descripción y precios. " +
    "Si la fecha de lanzamiento ya pasó respecto a FECHA_ACTUAL, usa pasado ('se lanzó'), nunca futuro ('se lanzará'). " +
    "Si el juego aún no ha salido, usa futuro de forma prudente. " +
    "Si faltan desarrolladora, editora, año o características, omítelos; no los rellenes con frases genéricas. " +
    "Evita fórmulas pobres como 'juego completo de'. " +
    "Evita adjetivos vacíos como 'único', 'envolvente', 'imprescindible' o 'los aficionados no querrán perdérselo'. " +
    "Prohibido decir 'exclusivo', 'aventura inmersiva', 'equipo talentoso', 'reconocida compañía' o similares si no aparece en la fuente. " +
    "Si hay releaseDateFormatted, úsala tal cual si mencionas fecha; no escribas fechas ISO. JSON: " +
    '{"description":"...","seoTitle":"...","seoDescription":"...","coverAlt":"...","jsonLdDescription":"...","faqs":[{"question":"...","answer":"..."}],"highlights":["..."]}';
  const descUser =
    `FECHA_ACTUAL: ${new Date().toISOString().slice(0, 10)}\n` +
    `HECHOS:\n${JSON.stringify(
      {
        ...facts,
        year: draft.year,
        releaseDate: draft.releaseDate,
        releaseDateAlreadyPassed: hasReleaseDatePassed(draft.releaseDate),
        catalogEditionNote:
          "La descripción debe referirse a esta ficha concreta del catálogo. Si hay releaseDate, úsala como lanzamiento de esta edición/plataforma.",
        developer: draft.developerName,
        publisher: draft.publisherName,
        genres: draft.genreNames,
      },
      null,
      2,
    )}\n\nREFERENCIA:\n${referenceText ?? "(ninguna)"}`;
  const descUserWithInstructions = options.extraInstructions?.trim()
    ? `${descUser}\n\nINSTRUCCIONES EXTRA DEL ADMIN:\n${options.extraInstructions.trim().slice(0, 1200)}`
    : descUser;

  try {
    const parsed = await openAiJson(descSystem, descUserWithInstructions);
    const description = sanitizeGeneratedCatalogText(String(parsed.description ?? ""), draft);
    if (description.length >= 40 && (!options.onlyMissing || !draft.description)) {
      draft.description = description.slice(0, 900);
      yield { type: "field", field: "description", value: draft.description };
    }

    const generatedSeo = {
      seoTitle: clip(String(parsed.seoTitle ?? draft.title), 70),
      seoDescription: clip(sanitizeGeneratedCatalogText(String(parsed.seoDescription ?? description), draft), 155),
      coverAlt: clip(String(parsed.coverAlt ?? `Portada de ${draft.title} para ${platformName}`), 120),
      jsonLdDescription: clip(sanitizeGeneratedCatalogText(String(parsed.jsonLdDescription ?? description), draft), 320),
      faqs: Array.isArray(parsed.faqs)
        ? (parsed.faqs as Array<{ question?: string; answer?: string }>)
            .filter((f) => f.question && f.answer)
            .slice(0, 4)
            .map((f) => ({ question: String(f.question), answer: String(f.answer) }))
        : [],
      highlights: Array.isArray(parsed.highlights)
        ? (parsed.highlights as unknown[]).map(String).slice(0, 4)
        : [],
      generatedAt: new Date().toISOString(),
      method: "ai" as const,
      model: descriptionModel(),
    };

    if (options.onlyMissing && draft.seoMeta) {
      draft.seoMeta = {
        ...draft.seoMeta,
        seoTitle: draft.seoMeta.seoTitle || generatedSeo.seoTitle,
        seoDescription: draft.seoMeta.seoDescription || generatedSeo.seoDescription,
        coverAlt: draft.seoMeta.coverAlt || generatedSeo.coverAlt,
        jsonLdDescription: draft.seoMeta.jsonLdDescription || generatedSeo.jsonLdDescription,
        faqs: (draft.seoMeta.faqs?.length ?? 0) > 0 ? draft.seoMeta.faqs : generatedSeo.faqs,
        highlights:
          (draft.seoMeta.highlights?.length ?? 0) > 0
            ? draft.seoMeta.highlights
            : generatedSeo.highlights,
        generatedAt: draft.seoMeta.generatedAt || generatedSeo.generatedAt,
        method: draft.seoMeta.method || generatedSeo.method,
        model: draft.seoMeta.model || generatedSeo.model,
      };
      yield { type: "field", field: "seoMeta", value: draft.seoMeta };
    } else if (!options.onlyMissing || !draft.seoMeta) {
      draft.seoMeta = generatedSeo;
      yield { type: "field", field: "seoMeta", value: draft.seoMeta };
    }

    if (!options.onlyMissing || !draft.descriptionMeta) {
      draft.descriptionMeta = {
        generatedAt: new Date().toISOString(),
        method: "ai",
        model: descriptionModel(),
        referenceUsed: Boolean(referenceText),
        referenceUrl,
      };
      yield { type: "field", field: "descriptionMeta", value: draft.descriptionMeta };
    }

    draft.updatedAt = new Date().toISOString();
    yield { type: "done", draft };
  } catch (error) {
    yield {
      type: "error",
      message: error instanceof Error ? error.message : "Error al generar descripción",
    };
  }
}

export function sseEncode(event: AdminAiFillEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
