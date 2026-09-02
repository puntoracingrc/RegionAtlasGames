import { parse as parseCsv } from "csv-parse/sync";
import readExcelFile from "read-excel-file/node";
import { normalizeImportedPlatformSlug } from "./collection-platform-slugs";
import { slugify } from "./slug";
import { catalog, platforms } from "./catalog";
import { getRegionDisplay } from "./region-display";
import type { CatalogGame, CollectionItem } from "./types";

const EXCEL_TO_SLUG: Record<string, string> = {
  PS1: "ps1",
  PS2: "ps2",
  PS3: "ps3",
  PS4: "ps4",
  PS5: "ps5",
  XBOX: "xbox",
  "XBOX 360": "xbox360",
  "XBOX ONE": "xboxone",
  "XBOX SERIES S": "xboxseriess",
  "XBOX SERIES X": "xboxseriesx",
  NES: "nes",
  SNES: "snes",
  N64: "n64",
  "GAME BOY": "gameboy",
  GAMECUBE: "gamecube",
  WII: "wii",
  "WII U": "wiiu",
  DS: "ds",
  "3DS": "3ds",
  "MEGA DRIVE": "megadrive",
  "32X": "sega32x",
  "SEGA 32X": "sega32x",
  "MEGA CD": "megacd",
  "MASTER SYSTEM": "mastersystem",
  SATURN: "saturn",
  DREAMCAST: "dreamcast",
  "GAME GEAR": "gamegear",
  "NEO GEO": "neogeo",
  "NEO GEO AES+": "neogeo-aes-plus",
  "NEOGEO AES+": "neogeo-aes-plus",
  "NEO GEO CD": "neogeocd",
  "NEO GEO POCKET": "neogeopocket",
  "NEO GEO POCKET COLOR": "neogeopocket",
};

export const MAX_SPREADSHEET_IMPORT_BYTES = 10 * 1024 * 1024;

export function isSupportedSpreadsheetFilename(filename: string): boolean {
  const normalized = filename.trim().toLowerCase();
  return normalized.endsWith(".xlsx") || normalized.endsWith(".csv");
}

/** Nombres de consola PriceCharting → slug interno */
const PC_CONSOLE_TO_SLUG: Record<string, string> = {
  nes: "nes",
  "pal nes": "nes",
  snes: "snes",
  "super nintendo": "snes",
  "pal super nintendo": "snes",
  "nintendo 64": "n64",
  "pal nintendo 64": "n64",
  n64: "n64",
  gameboy: "gameboy",
  "game boy": "gameboy",
  "pal gameboy": "gameboy",
  "pal game boy": "gameboy",
  gamecube: "gamecube",
  "pal gamecube": "gamecube",
  wii: "wii",
  "pal wii": "wii",
  ds: "ds",
  "nintendo ds": "ds",
  "pal nintendo ds": "ds",
  "3ds": "3ds",
  "nintendo 3ds": "3ds",
  "pal nintendo 3ds": "3ds",
  "mega drive": "megadrive",
  "sega mega drive": "megadrive",
  "pal sega mega drive": "megadrive",
  "sega genesis": "megadrive",
  genesis: "megadrive",
  "sega 32x": "sega32x",
  "32x": "sega32x",
  "pal mega drive 32x": "sega32x",
  "mega cd": "megacd",
  "sega cd": "megacd",
  "pal sega mega cd": "megacd",
  "sega master system": "mastersystem",
  "master system": "mastersystem",
  "pal sega master system": "mastersystem",
  saturn: "saturn",
  "sega saturn": "saturn",
  "pal sega saturn": "saturn",
  dreamcast: "dreamcast",
  "sega dreamcast": "dreamcast",
  "pal sega dreamcast": "dreamcast",
  "game gear": "gamegear",
  "sega game gear": "gamegear",
  "pal sega game gear": "gamegear",
  playstation: "ps1",
  "pal playstation": "ps1",
  "sony playstation": "ps1",
  ps1: "ps1",
  "playstation 2": "ps2",
  "pal playstation 2": "ps2",
  ps2: "ps2",
  "playstation 3": "ps3",
  "pal playstation 3": "ps3",
  ps3: "ps3",
  "playstation 4": "ps4",
  "pal playstation 4": "ps4",
  ps4: "ps4",
  "playstation 5": "ps5",
  "pal playstation 5": "ps5",
  playstation5: "ps5",
  ps5: "ps5",
  "jp playstation 4": "ps4",
  "japanese playstation 4": "ps4",
  "xbox 360": "xbox360",
  xbox: "xbox",
  "original xbox": "xbox",
  "microsoft xbox": "xbox",
  "pal xbox": "xbox",
  "pal xbox 360": "xbox360",
  "neo geo": "neogeo",
  "neo geo aes": "neogeo",
  "neo geo aes+": "neogeo-aes-plus",
  "neogeo aes+": "neogeo-aes-plus",
  "neo geo cd": "neogeocd",
  "neo geo pocket": "neogeopocket",
  "neo geo pocket color": "neogeopocket",
  "nintendo switch": "switch",
  switch: "switch",
  "nintendo switch 2": "switch2",
  "pal nintendo switch 2": "switch2",
  "switch 2": "switch2",
  "xbox one": "xboxone",
  "xbox series x": "xboxseriesx",
  "xbox series s": "xboxseriess",
  "xbox series x/s": "xboxseriesx",
  "xbox series": "xboxseriesx",
  "nintendo wii u": "wiiu",
  "wii u": "wiiu",
  "pal nintendo wii u": "wiiu",
  "game boy color": "gameboycolor",
  "gameboy color": "gameboycolor",
  gbc: "gameboycolor",
  psp: "psp",
  "playstation portable": "psp",
  "ps vita": "psvita",
  "playstation vita": "psvita",
  psvita: "psvita",
  "pc engine": "pcengine",
  "turbografx 16": "pcengine",
  turbografx: "pcengine",
};

const REGIONAL_PREFIXES = ["pal ", "jp ", "ntsc ", "sony ", "japanese "];

const COLUMN_ALIASES: Record<string, string[]> = {
  title: [
    "titulo",
    "title",
    "nombre",
    "juego",
    "product name",
    "product",
    "game name",
    "game",
    "name",
  ],
  platform: ["plataforma", "platform", "consola", "sistema", "console name", "console", "system"],
  region: ["region", "country"],
  sealed: ["precintado", "sealed", "nuevo", "new sealed"],
  condition: ["condition", "condicion", "item condition", "includes", "include string", "condition string"],
  quantity: ["cantidad", "quantity", "qty", "unidades", "count"],
  quantityPc: ["cantidad pc verificada", "cantidad pc"],
  buyPrice: [
    "precio compra",
    "buy price",
    "compra",
    "price paid",
    "paid",
    "cost",
    "purchase price",
    "cost basis in pennies",
    "cost-basis-in-pennies",
  ],
  previousSalePrice: ["precio venta anterior", "previous sale"],
  recommendedPrice: [
    "precio venta recomendado",
    "precio venta",
    "venta",
    "value",
    "your price",
    "price in pennies",
    "price-in-pennies",
  ],
  loosePrice: ["loose price", "loose-price"],
  cibPrice: ["cib price", "cib-price", "complete price"],
  newPrice: ["new price", "new-price", "sealed price"],
  marketMin: ["precio mercado es min", "mercado min", "market min"],
  marketMax: ["precio mercado es max", "mercado max", "market max"],
  pcRefPrice: ["ref. pricecharting eu", "ref pricecharting", "precio pc", "pricecharting price"],
  deltaEsVsPc: ["delta es vs pc", "delta"],
  priceSource: ["fuente precio", "fuente", "source"],
  updatedAt: ["fecha actualizacion", "fecha actualización", "actualizado", "date", "date entered", "date-entered"],
  notes: ["notas", "notes", "comentarios", "item notes", "description"],
  coverUrl: ["url portada", "portada", "cover", "photo", "photos"],
  titlePc: ["titulo pricecharting", "pricecharting title"],
  pcId: ["id pricecharting", "pc id", "product id", "id"],
};

export type ImportStats = {
  totalRows: number;
  imported: number;
  matchedCatalog: number;
  unmatched: number;
  skipped: number;
  detectedHeaders: string[];
  warnings: string[];
  byPlatform: Record<string, { items: number; units: number }>;
};

const retroSlugs = new Set(platforms.map((p) => p.slug));

export { normalizeImportedPlatformSlug } from "./collection-platform-slugs";

export function repairCollectionPlatform(item: CollectionItem): CollectionItem {
  const platformSlug = normalizeImportedPlatformSlug(item.platformSlug);
  const inRetroCatalog = retroSlugs.has(platformSlug);
  if (platformSlug === item.platformSlug && inRetroCatalog === item.inRetroCatalog) return item;
  return {
    ...item,
    platformSlug,
    inRetroCatalog,
  };
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clean(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isNaN(value)) return null;
  const v = String(value).trim();
  if (!v || v.toLowerCase() === "nan") return null;
  return v;
}

function num(value: unknown, options?: { pennies?: boolean }): number | null {
  const v = clean(value);
  if (v == null) return null;
  const normalized = v.replace(/[€$£\s]/g, "").replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  if (options?.pennies || n > 10_000) {
    return Math.round((n / 100) * 100) / 100;
  }
  return Math.round(n * 100) / 100;
}

function resolveConsoleSlug(normalized: string): string | null {
  if (PC_CONSOLE_TO_SLUG[normalized]) {
    return normalizeImportedPlatformSlug(PC_CONSOLE_TO_SLUG[normalized]);
  }

  for (const prefix of REGIONAL_PREFIXES) {
    if (!normalized.startsWith(prefix)) continue;
    const stripped = normalized.slice(prefix.length);
    if (PC_CONSOLE_TO_SLUG[stripped]) {
      return normalizeImportedPlatformSlug(PC_CONSOLE_TO_SLUG[stripped]);
    }
  }

  return null;
}

function platformSlug(raw: string | null): string | null {
  if (!raw) return null;
  const normalized = normalizeHeader(raw);
  const mapped = resolveConsoleSlug(normalized);
  if (mapped) return mapped;

  const key = raw.trim().toUpperCase();
  if (EXCEL_TO_SLUG[key]) return normalizeImportedPlatformSlug(EXCEL_TO_SLUG[key]);
  const slug = slugify(raw);
  return slug ? normalizeImportedPlatformSlug(slug) : null;
}

function columnMatchScore(header: string, alias: string): number {
  if (!header || !alias) return 0;
  if (header === alias) return 100;
  if (header.startsWith(`${alias} `) || header.endsWith(` ${alias}`)) return 95;
  const tokens = header.split(" ");
  if (tokens.includes(alias)) return 90;
  if (alias.length <= 3) return 0;
  if (header.includes(alias)) return 85;
  const hTokens = new Set(tokens);
  const aTokens = alias.split(" ");
  if (aTokens.every((t) => hTokens.has(t))) return 80;
  return 0;
}

function parsePcId(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d]/g, "");
  if (!cleaned) return null;
  const n = Number.parseInt(cleaned, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function mapColumns(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const normalized = headers.map(normalizeHeader);

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < normalized.length; i++) {
      const header = normalized[i];
      if (!header) continue;
      for (const alias of aliases) {
        const score = columnMatchScore(header, alias);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
    }
    if (bestIdx >= 0 && bestScore >= 80) map[field] = bestIdx;
  }
  return map;
}

function cell(row: unknown[], col: number | undefined): unknown {
  if (col === undefined) return null;
  return row[col] ?? null;
}

function findHeaderRowIndex(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const headers = rows[i]?.map((h) => String(h ?? "")) ?? [];
    const cols = mapColumns(headers);
    if (cols.title !== undefined && cols.platform !== undefined) return i;
  }
  return 0;
}

export async function parseSpreadsheet(buffer: Buffer, filename: string): Promise<unknown[][]> {
  const normalized = filename.trim().toLowerCase();

  if (normalized.endsWith(".csv")) {
    return parseCsv(buffer, {
      bom: true,
      delimiter: [",", ";", "\t"],
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: false,
    }) as unknown[][];
  }

  if (!normalized.endsWith(".xlsx")) {
    throw new Error("Formato no soportado. Usa .xlsx o .csv.");
  }

  const sheets = await readExcelFile(buffer);
  const selected = sheets.find((sheet) => sheet.sheet.trim().toUpperCase() === "TODO") ?? sheets[0];
  if (!selected) return [];

  return selected.data.map((row) =>
    row.map((value) => (value instanceof Date ? value.toISOString() : value)),
  );
}

function slugKey(text: string): string {
  return slugify(text);
}

/**
 * Importaciones antiguas cuyo título identifica una edición inequívoca pero
 * arrastran una región por defecto o una grafía distinta a la ficha canónica.
 */
const LEGACY_COLLECTION_CATALOG_OVERRIDES: Record<string, string> = {
  "ps2::mega-man-anniversary-collection": "ps2-usa-mega-man-anniversary-collection",
  "ps3::skylander-s-giants-portal-owners-pack":
    "ps3-usa-skylander-s-giants-portal-owners-pack",
  "ps4::brigandine-the-legend-of-runersia-collector-s-edition":
    "ps4-brigandine-the-legend-of-runersia-collectors-edition",
  "ps4::carrion-limited-run": "ps4-usa-carrion-limited-run",
  "ps4::fallout-4-game-of-the-year-slipcover":
    "ps4-usa-fallout-4-game-of-the-year-slipcover",
  "ps4::mega-man-legacy-collection": "ps4-usa-mega-man-legacy-collection",
  "ps4::mega-man-x-legacy-collection-1-2":
    "ps4-usa-mega-man-x-legacy-collection-1-&#43;-2",
  "ps4::star-hunter-dx-space-moth-lunar-edition-special-limited-edition":
    "ps4-star-hunter-dx-space-moth-lunar-editon",
  "ps5::final-fantasy-vii-remake-intergrade-rebirth-twin-pack":
    "ps5-final-fantasy-vii-remake-intergrade-rebirth-twin-pack-physical-edition",
  "xbox360::spec-ops-the-line": "xbox360-spec-ops-the-line",
};

function buildCatalogMatchIndex() {
  const byPlatformTitle = new Map<string, string | null>();
  const byPlatformTitleRegion = new Map<string, string | null>();
  const byId = new Map(catalog.map((g) => [g.id, g]));

  function register(index: Map<string, string | null>, key: string, gameId: string) {
    const existing = index.get(key);
    if (existing === undefined || existing === gameId) {
      index.set(key, gameId);
      return;
    }
    index.set(key, null);
  }

  for (const game of catalog) {
    if (game.listingStatus === "excluded") continue;
    const regionKey = normalizeRegionMatchKey(game.region);
    for (const title of [game.title, game.titlePc].filter(Boolean) as string[]) {
      const key = `${game.platformSlug}::${slugKey(title)}`;
      register(byPlatformTitle, key, game.id);
      if (regionKey) {
        register(byPlatformTitleRegion, `${key}::${regionKey}`, game.id);
      }
    }
  }

  return { byPlatformTitle, byPlatformTitleRegion, byId };
}

const catalogMatchIndex = buildCatalogMatchIndex();

function normalizeRegionMatchKey(region: string | null | undefined): string | null {
  if (!region?.trim() || region.trim() === "—") return null;
  return slugify(getRegionDisplay(region).label);
}

function matchesImportedRegion(game: CatalogGame, region: string | null): boolean {
  const expected = normalizeRegionMatchKey(region);
  return expected == null || normalizeRegionMatchKey(game.region) === expected;
}

function findCatalogMatch(
  platform: string,
  title: string,
  titlePc: string | null,
  pcId: number | null,
  region: string | null,
): CatalogGame | null {
  const { byPlatformTitle, byPlatformTitleRegion, byId } = catalogMatchIndex;

  const overrideId = LEGACY_COLLECTION_CATALOG_OVERRIDES[`${platform}::${slugKey(title)}`];
  const override = overrideId ? byId.get(overrideId) : null;
  if (
    override &&
    override.platformSlug === platform &&
    override.listingStatus !== "excluded"
  ) {
    return override;
  }

  if (pcId != null) {
    const byPcId = catalog.filter(
      (g) =>
        g.platformSlug === platform &&
        g.pcId === pcId &&
        g.listingStatus !== "excluded" &&
        matchesImportedRegion(g, region),
    );
    if (byPcId.length === 1) return byPcId[0];
  }

  const directId = `${platform}-${slugify(title)}`;
  const direct = byId.get(directId);
  if (
    direct &&
    direct.listingStatus !== "excluded" &&
    matchesImportedRegion(direct, region)
  ) {
    return direct;
  }

  const keys = [
    `${platform}::${slugify(title)}`,
    titlePc ? `${platform}::${slugify(titlePc)}` : null,
  ].filter(Boolean) as string[];

  const regionKey = normalizeRegionMatchKey(region);
  for (const key of keys) {
    const regionalId = regionKey ? byPlatformTitleRegion.get(`${key}::${regionKey}`) : null;
    if (regionalId && byId.has(regionalId)) return byId.get(regionalId)!;

    const id = byPlatformTitle.get(key);
    const candidate = id ? byId.get(id) : null;
    if (candidate && matchesImportedRegion(candidate, region)) return candidate;
  }

  return null;
}

export function isPlatformCatalogActive(platformSlug: string): boolean {
  const slug = normalizeImportedPlatformSlug(platformSlug);
  return retroSlugs.has(slug);
}

function hasCatalogGame(catalogId: string | null | undefined): boolean {
  return Boolean(catalogId && catalog.some((game) => game.id === catalogId));
}

/** Si la plataforma ya está activa en RA y existe ficha, devuelve el juego del catálogo. */
export function findAvailableCatalogLink(item: CollectionItem): CatalogGame | null {
  if (item.catalogMatched && hasCatalogGame(item.catalogId)) return null;

  const platform = normalizeImportedPlatformSlug(item.platformSlug);
  if (!isPlatformCatalogActive(platform)) return null;

  return findCatalogMatch(
    platform,
    item.title,
    item.titlePc ?? item.title,
    item.pcImportId ?? null,
    item.region,
  );
}

function inferRegion(raw: string | null, platform: string): string {
  if (raw) return raw;
  return retroSlugs.has(platform) ? "PAL España" : "—";
}

function inferSealed(condition: string | null, sealedRaw: string | null): boolean {
  if (sealedRaw) {
    return ["si", "sí", "yes", "true", "1"].includes(sealedRaw.toLowerCase());
  }
  if (!condition) return false;
  const c = condition.toLowerCase();
  return c.includes("new") || c.includes("sealed") || c.includes("precint") || c === "nuevo";
}

function inferCollectionCondition(
  condition: string | null,
  sealedRaw: string | null,
): CollectionItem["collectionCondition"] {
  if (inferSealed(condition, sealedRaw)) return "sealed";
  const value = (condition ?? "").toLowerCase();
  if (value.includes("game") && value.includes("manual")) return "game-manual";
  if (value.includes("juego") && value.includes("manual")) return "game-manual";
  if (value.includes("cib") || value.includes("complete") || value.includes("completo")) {
    return "complete";
  }
  if (
    value.includes("loose") ||
    value.includes("suelto") ||
    value.includes("disc only") ||
    value.includes("disco solo")
  ) {
    return "loose";
  }
  return "unknown";
}

function priceFromCondition(
  row: unknown[],
  cols: Record<string, number>,
  condition: string | null,
  priceOpts?: { pennies?: boolean },
): number | null {
  const c = (condition ?? "").toLowerCase();
  if (c.includes("new") || c.includes("sealed") || c.includes("precint")) {
    return (
      num(cell(row, cols.newPrice), priceOpts) ?? num(cell(row, cols.recommendedPrice), priceOpts)
    );
  }
  if (c.includes("cib") || c.includes("complete") || c.includes("box")) {
    return (
      num(cell(row, cols.cibPrice), priceOpts) ?? num(cell(row, cols.recommendedPrice), priceOpts)
    );
  }
  return (
    num(cell(row, cols.loosePrice), priceOpts) ??
    num(cell(row, cols.recommendedPrice), priceOpts) ??
    num(cell(row, cols.cibPrice), priceOpts) ??
    num(cell(row, cols.newPrice), priceOpts)
  );
}

function headerUsesPennies(headers: string[], colIndex: number | undefined): boolean {
  if (colIndex === undefined) return false;
  return normalizeHeader(headers[colIndex] ?? "").includes("penn");
}

function marketFields(
  row: unknown[],
  cols: Record<string, number>,
  condition: string | null,
  headers: string[],
) {
  const priceOpts = {
    pennies:
      headerUsesPennies(headers, cols.recommendedPrice) ||
      headerUsesPennies(headers, cols.loosePrice) ||
      headerUsesPennies(headers, cols.cibPrice) ||
      headerUsesPennies(headers, cols.newPrice),
  };
  const buyOpts = {
    pennies: headerUsesPennies(headers, cols.buyPrice) || priceOpts.pennies,
  };
  const recommendedPrice = priceFromCondition(row, cols, condition, priceOpts);
  const priceSource = clean(cell(row, cols.priceSource));
  return {
    marketMin: num(cell(row, cols.marketMin), priceOpts),
    marketMax: num(cell(row, cols.marketMax), priceOpts),
    recommendedPrice,
    buyPriceFromImport: num(cell(row, cols.buyPrice), buyOpts),
    pcRefPrice:
      num(cell(row, cols.pcRefPrice), priceOpts) ??
      num(cell(row, cols.loosePrice), priceOpts) ??
      num(cell(row, cols.cibPrice), priceOpts) ??
      num(cell(row, cols.newPrice), priceOpts),
    deltaEsVsPc: num(cell(row, cols.deltaEsVsPc)),
    priceSource: priceSource ?? (recommendedPrice != null ? "PriceCharting" : null),
    updatedAt: clean(cell(row, cols.updatedAt)),
    hasEsPrice: priceSource === "Wallapop/eBay ES" || recommendedPrice != null,
    priceRegionVerified: false,
  };
}

export function importRowsToCollection(rows: unknown[][]): {
  items: CollectionItem[];
  stats: ImportStats;
} {
  const stats: ImportStats = {
    totalRows: 0,
    imported: 0,
    matchedCatalog: 0,
    unmatched: 0,
    skipped: 0,
    detectedHeaders: [],
    warnings: [],
    byPlatform: {},
  };

  if (rows.length < 2) {
    stats.warnings.push("El archivo no contiene filas de datos.");
    return { items: [], stats };
  }

  const headerRowIndex = findHeaderRowIndex(rows);
  const headers = rows[headerRowIndex].map((h) => String(h ?? "").replace(/^\uFEFF/, "").trim());
  stats.detectedHeaders = headers.filter(Boolean);
  const cols = mapColumns(headers);

  if (cols.title === undefined || cols.platform === undefined) {
    const preview = stats.detectedHeaders.slice(0, 8).join(", ") || "(vacío)";
    stats.warnings.push(
      `No encontramos columnas de juego y consola. Cabeceras detectadas: ${preview}. ` +
        "PriceCharting usa «product-name» y «console-name»; plantillas propias usan «Título» y «Plataforma».",
    );
    return { items: [], stats };
  }

  const items: CollectionItem[] = [];
  const idCounts = new Map<string, number>();

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => clean(c) == null)) continue;

    stats.totalRows += 1;
    const title = clean(cell(row, cols.title));
    if (!title || ["titulo", "title", "product name"].includes(title.toLowerCase())) {
      stats.skipped += 1;
      continue;
    }

    const plat = platformSlug(clean(cell(row, cols.platform)));
    if (!plat) {
      stats.skipped += 1;
      stats.warnings.push(`Fila ${i + 1}: consola no reconocida («${clean(cell(row, cols.platform))}»).`);
      continue;
    }

    const consoleName = clean(cell(row, cols.platform));
    const titlePc = clean(cell(row, cols.titlePc)) ?? title;
    const pcIdRaw = clean(cell(row, cols.pcId));
    const pcId = parsePcId(pcIdRaw);
    const region = inferRegion(clean(cell(row, cols.region)), plat);
    const condition = clean(cell(row, cols.condition));
    const inRetro = retroSlugs.has(plat);

    const matched = inRetro ? findCatalogMatch(plat, title, titlePc, pcId, region) : null;
    const catalogMatched = Boolean(matched);

    const base = `${plat}--${slugify(title)}`;
    const count = idCounts.get(base) ?? 0;
    idCounts.set(base, count + 1);
    const itemId = count === 0 ? base : `${base}-${count + 1}`;

    const qty = Math.max(1, Math.floor(num(cell(row, cols.quantity)) ?? 1));
    const market = marketFields(row, cols, condition, headers);
    const rec = market.recommendedPrice;

    if (catalogMatched) stats.matchedCatalog += 1;
    else if (inRetro) stats.unmatched += 1;

    const sealedRaw = clean(cell(row, cols.sealed));
    items.push({
      id: itemId,
      catalogId: matched?.id ?? null,
      catalogMatched,
      inRetroCatalog: inRetro,
      title,
      titlePc,
      consoleName,
      pcImportId: pcId,
      platformSlug: plat,
      region,
      sealed: inferSealed(condition, sealedRaw),
      collectionCondition: inferCollectionCondition(condition, sealedRaw),
      quantity: qty,
      quantityPc: num(cell(row, cols.quantityPc)),
      buyPrice: market.buyPriceFromImport,
      previousSalePrice: num(cell(row, cols.previousSalePrice)),
      totalValue: rec != null ? Math.round(rec * qty * 100) / 100 : null,
      notes: clean(cell(row, cols.notes)),
      marketMin: market.marketMin,
      marketMax: market.marketMax,
      recommendedPrice: market.recommendedPrice,
      pcRefPrice: market.pcRefPrice,
      deltaEsVsPc: market.deltaEsVsPc,
      priceSource: market.priceSource,
      updatedAt: market.updatedAt,
      hasEsPrice: market.hasEsPrice,
      priceRegionVerified: market.priceRegionVerified,
    });
    stats.imported += 1;
  }

  if (stats.imported === 0 && stats.totalRows > 0) {
    stats.warnings.push("No se importó ninguna fila válida. Revisa consolas y títulos.");
  }

  stats.byPlatform = {};
  for (const item of items) {
    const slug = normalizeImportedPlatformSlug(item.platformSlug);
    if (!stats.byPlatform[slug]) stats.byPlatform[slug] = { items: 0, units: 0 };
    stats.byPlatform[slug].items += 1;
    stats.byPlatform[slug].units += item.quantity;
  }

  return { items, stats };
}

export async function importSpreadsheet(buffer: Buffer, filename: string) {
  const rows = await parseSpreadsheet(buffer, filename);
  return importRowsToCollection(rows);
}

export function pendingCatalogItems(items: CollectionItem[]): CollectionItem[] {
  return items.filter((item) => item.inRetroCatalog && (!item.catalogMatched || !hasCatalogGame(item.catalogId)));
}

export function outOfScopeCollectionItems(items: CollectionItem[]): CollectionItem[] {
  return items.filter((item) => !item.inRetroCatalog);
}
