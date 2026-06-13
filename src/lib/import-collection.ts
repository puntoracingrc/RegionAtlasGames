import * as XLSX from "xlsx";
import { normalizeImportedPlatformSlug } from "./collection-platform-slugs";
import { slugify } from "./slug";
import { catalog, platforms } from "./catalog";
import type { CatalogGame, CollectionItem } from "./types";

const EXCEL_TO_SLUG: Record<string, string> = {
  PS1: "ps1",
  PS2: "ps2",
  PS3: "ps3",
  PS4: "ps4",
  PS5: "ps5",
  NES: "nes",
  SNES: "snes",
  N64: "n64",
  "GAME BOY": "gameboy",
  GAMECUBE: "gamecube",
  WII: "wii",
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
  "NEO GEO CD": "neogeocd",
  "NEO GEO POCKET": "neogeopocket",
  "NEO GEO POCKET COLOR": "neogeopocket",
};

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
  "pal xbox 360": "xbox360",
  "neo geo": "neogeo",
  "neo geo aes": "neogeo",
  "neo geo cd": "neogeocd",
  "neo geo pocket": "neogeopocket",
  "neo geo pocket color": "neogeopocket",
  "nintendo switch": "switch",
  switch: "switch",
  "switch 2": "switch2",
  "xbox one": "xboxone",
  "xbox series x": "xboxseriesx",
  "xbox series s": "xboxseriesx",
  "game boy color": "gameboycolor",
  "gameboy color": "gameboycolor",
  gbc: "gameboycolor",
  psp: "psp",
  "playstation portable": "psp",
  "ps vita": "psvita",
  "playstation vita": "psvita",
  psvita: "psvita",
  "wii u": "wiiu",
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
  updatedAt: ["fecha actualizacion", "fecha actualización", "actualizado", "date"],
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
  if (platformSlug === item.platformSlug) return item;
  return {
    ...item,
    platformSlug,
    inRetroCatalog: retroSlugs.has(platformSlug),
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

export function parseSpreadsheet(buffer: Buffer, filename: string): unknown[][] {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    codepage: 65001,
  });
  const sheetName =
    workbook.SheetNames.find((n) => n.toUpperCase() === "TODO") ??
    workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
  }) as unknown[][];
}

function slugKey(text: string): string {
  return slugify(text);
}

function buildCatalogMatchIndex() {
  const byPlatformTitle = new Map<string, string>();
  const byId = new Map(catalog.map((g) => [g.id, g]));

  for (const game of catalog) {
    if (game.listingStatus === "excluded") continue;
    const key = `${game.platformSlug}::${slugKey(game.title)}`;
    if (!byPlatformTitle.has(key)) {
      byPlatformTitle.set(key, game.id);
    }
    if (game.titlePc) {
      const pcKey = `${game.platformSlug}::${slugKey(game.titlePc)}`;
      if (!byPlatformTitle.has(pcKey)) {
        byPlatformTitle.set(pcKey, game.id);
      }
    }
  }

  return { byPlatformTitle, byId };
}

function findCatalogMatch(
  platform: string,
  title: string,
  titlePc: string | null,
  pcId: number | null,
  region: string | null,
): CatalogGame | null {
  const { byPlatformTitle, byId } = buildCatalogMatchIndex();

  if (pcId != null) {
    const byPcId = catalog.find(
      (g) => g.platformSlug === platform && g.pcId === pcId && g.listingStatus !== "excluded",
    );
    if (byPcId) return byPcId;
  }

  const directId = `${platform}-${slugify(title)}`;
  if (byId.has(directId)) return byId.get(directId)!;

  const keys = [
    `${platform}::${slugify(title)}`,
    titlePc ? `${platform}::${slugify(titlePc)}` : null,
  ].filter(Boolean) as string[];

  for (const key of keys) {
    const id = byPlatformTitle.get(key);
    if (id && byId.has(id)) return byId.get(id)!;
  }

  const candidates = catalog.filter(
    (g) =>
      g.platformSlug === platform &&
      g.listingStatus !== "excluded" &&
      slugify(g.title) === slugify(title),
  );

  if (candidates.length === 1) return candidates[0];

  if (candidates.length > 1 && region) {
    const regionLower = region.toLowerCase();
    const regional = candidates.find((g) =>
      g.region.toLowerCase().includes(regionLower.slice(0, 3)),
    );
    if (regional) return regional;
  }

  return candidates[0] ?? null;
}

export function isPlatformCatalogActive(platformSlug: string): boolean {
  const slug = normalizeImportedPlatformSlug(platformSlug);
  return retroSlugs.has(slug);
}

/** Si la plataforma ya está activa en RA y existe ficha, devuelve el juego del catálogo. */
export function findAvailableCatalogLink(item: CollectionItem): CatalogGame | null {
  if (item.catalogMatched && item.catalogId) return null;

  const platform = normalizeImportedPlatformSlug(item.platformSlug);
  if (!isPlatformCatalogActive(platform)) return null;

  return findCatalogMatch(platform, item.title, item.title, null, item.region);
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
      sealed: inferSealed(condition, clean(cell(row, cols.sealed))),
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

export function importSpreadsheet(buffer: Buffer, filename: string) {
  const rows = parseSpreadsheet(buffer, filename);
  return importRowsToCollection(rows);
}

export function pendingCatalogItems(items: CollectionItem[]): CollectionItem[] {
  return items.filter((item) => item.inRetroCatalog && !item.catalogMatched);
}

export function outOfScopeCollectionItems(items: CollectionItem[]): CollectionItem[] {
  return items.filter((item) => !item.inRetroCatalog);
}
