import type { CatalogStagingGame } from "./catalog-staging-types";

const PC_BASE = "https://www.pricecharting.com";
const USER_AGENT = "RegionAtlasGames/1.0 (catalog staging enrich)";

const PC_IMG_RE = /https:\/\/storage\.googleapis\.com\/images\.pricecharting\.com\/[^"']+/i;
const PRODUCT_ID_RE = /data-product-id="(\d+)"/;
const TITLE_RE = /<h1[^>]*id="product_name"[^>]*>([^<]+)</i;
const CANONICAL_PATH_RE = /<link rel="canonical" href="https:\/\/www\.pricecharting\.com(\/game\/[^"]+)"/i;

export type PriceChartingPageData = {
  pcPath: string;
  productId: number | null;
  titlePc: string | null;
  coverSourceUrl: string | null;
};

function upscalePcThumb(url: string): string {
  return url.replace(/\/\d+\.(jpg|png|webp)$/i, "/1600.$1");
}

function parseProductId(html: string): number | null {
  const match = html.match(PRODUCT_ID_RE);
  if (!match) return null;
  const id = Number.parseInt(match[1], 10);
  return Number.isFinite(id) ? id : null;
}

export function parsePriceChartingGamePage(html: string): PriceChartingPageData | null {
  const canonical = html.match(CANONICAL_PATH_RE);
  const pcPath = canonical?.[1] ?? null;
  if (!pcPath?.startsWith("/game/")) return null;

  const titleMatch = html.match(TITLE_RE);
  const imgMatch = html.match(PC_IMG_RE);

  return {
    pcPath,
    productId: parseProductId(html),
    titlePc: titleMatch?.[1]?.trim() ?? null,
    coverSourceUrl: imgMatch ? upscalePcThumb(imgMatch[0]) : null,
  };
}

export async function fetchPriceChartingGamePage(pcPath: string): Promise<string | null> {
  const url = `${PC_BASE}${pcPath.startsWith("/") ? pcPath : `/${pcPath}`}`;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

export async function enrichStagingGameFromPriceCharting(
  game: CatalogStagingGame,
): Promise<CatalogStagingGame> {
  const candidates = [game.pcPath, game.pcPathGuess].filter(
    (path): path is string => Boolean(path?.startsWith("/game/")),
  );

  for (const pcPath of candidates) {
    const html = await fetchPriceChartingGamePage(pcPath);
    if (!html) continue;

    const parsed = parsePriceChartingGamePage(html);
    if (!parsed) continue;

    if (parsed.productId != null && parsed.productId !== game.pcId) {
      continue;
    }

    const slug = parsed.pcPath.split("/").pop() ?? "";
    const coverUrl = parsed.coverSourceUrl
      ? `/covers/${game.platformSlug}/${slug}.jpg`
      : game.coverUrl;

    return {
      ...game,
      status: "enriched",
      pcPath: parsed.pcPath,
      titlePc: parsed.titlePc ?? game.titlePc,
      coverSourceUrl: parsed.coverSourceUrl ?? game.coverSourceUrl,
      coverUrl,
      enrichedAt: new Date().toISOString(),
      enrichError: null,
    };
  }

  return {
    ...game,
    enrichError: "No se pudo verificar la ficha en PriceCharting.",
  };
}

export function pickStagingGamesForEnrichment(
  games: CatalogStagingGame[],
  limit: number,
): CatalogStagingGame[] {
  return games
    .filter((game) => game.status === "pending-catalog")
    .sort((a, b) => b.unitCount - a.unitCount || b.userCount - a.userCount)
    .slice(0, limit);
}
