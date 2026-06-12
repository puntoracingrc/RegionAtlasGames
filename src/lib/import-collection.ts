import * as XLSX from "xlsx";
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

const COLUMN_ALIASES: Record<string, string[]> = {
  title: ["título", "titulo", "title", "nombre", "juego"],
  platform: ["plataforma", "platform", "consola", "sistema"],
  region: ["región", "region"],
  sealed: ["precintado", "sealed", "nuevo"],
  quantity: ["cantidad", "quantity", "qty", "unidades"],
  quantityPc: ["cantidad pc verificada", "cantidad pc"],
  buyPrice: ["precio compra (€)", "precio compra", "buy price", "compra"],
  previousSalePrice: ["precio venta anterior (€)", "precio venta anterior"],
  recommendedPrice: [
    "precio venta recomendado (€)",
    "precio venta recomendado",
    "precio venta",
    "venta",
  ],
  marketMin: ["precio mercado es mín (€)", "precio mercado es min", "mercado min"],
  marketMax: ["precio mercado es máx (€)", "precio mercado es max", "mercado max"],
  pcRefPrice: ["ref. pricecharting eu (€)", "ref pricecharting", "precio pc"],
  deltaEsVsPc: ["δ es vs pc (%)", "delta es vs pc", "delta"],
  priceSource: ["fuente precio", "fuente"],
  updatedAt: ["fecha actualización", "fecha actualizacion", "actualizado"],
  notes: ["notas", "notes", "comentarios"],
  coverUrl: ["url portada", "portada", "cover"],
  titlePc: ["título pricecharting", "titulo pricecharting"],
  pcId: ["id pricecharting", "pc id"],
};

export type ImportStats = {
  totalRows: number;
  imported: number;
  matchedCatalog: number;
  unmatched: number;
  skipped: number;
  warnings: string[];
};

const retroSlugs = new Set(platforms.map((p) => p.slug));

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function clean(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isNaN(value)) return null;
  const v = String(value).trim();
  if (!v || v.toLowerCase() === "nan") return null;
  return v;
}

function num(value: unknown): number | null {
  const v = clean(value);
  if (v == null) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function platformSlug(raw: string | null): string | null {
  if (!raw) return null;
  const key = raw.trim().toUpperCase();
  return EXCEL_TO_SLUG[key] ?? slugify(raw);
}

function mapColumns(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const normalized = headers.map(normalizeHeader);

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx !== -1) map[field] = idx;
  }
  return map;
}

function cell(row: unknown[], col: number | undefined): unknown {
  if (col === undefined) return null;
  return row[col] ?? null;
}

export function parseSpreadsheet(buffer: Buffer, filename: string): unknown[][] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName =
    workbook.SheetNames.find((n) => n.toUpperCase() === "TODO") ??
    workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
  }) as unknown[][];

  if (filename.toLowerCase().endsWith(".csv") && rows.length > 0) {
    return rows;
  }
  return rows;
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

  if (pcId != null) {
    const byPcId = catalog.find(
      (g) => g.platformSlug === platform && g.pcId === pcId && g.listingStatus !== "excluded",
    );
    if (byPcId) return byPcId;
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

function marketFields(row: unknown[], cols: Record<string, number>) {
  const recommendedPrice = num(cell(row, cols.recommendedPrice));
  const priceSource = clean(cell(row, cols.priceSource));
  return {
    marketMin: num(cell(row, cols.marketMin)),
    marketMax: num(cell(row, cols.marketMax)),
    recommendedPrice,
    pcRefPrice: num(cell(row, cols.pcRefPrice)),
    deltaEsVsPc: num(cell(row, cols.deltaEsVsPc)),
    priceSource,
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
    warnings: [],
  };

  if (rows.length < 2) {
    stats.warnings.push("El archivo no contiene filas de datos.");
    return { items: [], stats };
  }

  const headers = rows[0].map((h) => String(h ?? ""));
  const cols = mapColumns(headers);

  if (cols.title === undefined || cols.platform === undefined) {
    stats.warnings.push(
      "Faltan columnas obligatorias: Título y Plataforma (o Title / Platform).",
    );
    return { items: [], stats };
  }

  const items: CollectionItem[] = [];
  const idCounts = new Map<string, number>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => clean(c) == null)) continue;

    stats.totalRows += 1;
    const title = clean(cell(row, cols.title));
    if (!title || title.toLowerCase() === "título") {
      stats.skipped += 1;
      continue;
    }

    const plat = platformSlug(clean(cell(row, cols.platform)));
    if (!plat) {
      stats.skipped += 1;
      continue;
    }

    const titlePc = clean(cell(row, cols.titlePc));
    const pcId = num(cell(row, cols.pcId));
    const region = clean(cell(row, cols.region)) ?? "PAL España";
    const inRetro = retroSlugs.has(plat);

    const matched = inRetro
      ? findCatalogMatch(plat, title, titlePc, pcId, region)
      : null;
    const fallbackCatalogId = inRetro ? `${plat}-${slugify(title)}` : null;

    const base = slugify(title);
    const count = idCounts.get(base) ?? 0;
    idCounts.set(base, count + 1);
    const itemId = count === 0 ? base : `${base}-${count + 1}`;

    const qty = Math.max(1, Math.floor(num(cell(row, cols.quantity)) ?? 1));
    const market = marketFields(row, cols);
    const rec = market.recommendedPrice;

    if (matched) stats.matchedCatalog += 1;
    else if (inRetro) stats.unmatched += 1;

    items.push({
      id: itemId,
      catalogId: matched?.id ?? fallbackCatalogId,
      inRetroCatalog: inRetro,
      title,
      platformSlug: plat,
      region,
      sealed: ["si", "sí", "yes", "true", "1"].includes(
        (clean(cell(row, cols.sealed)) ?? "").toLowerCase(),
      ),
      quantity: qty,
      quantityPc: num(cell(row, cols.quantityPc)),
      buyPrice: num(cell(row, cols.buyPrice)),
      previousSalePrice: num(cell(row, cols.previousSalePrice)),
      totalValue: rec != null ? Math.round(rec * qty * 100) / 100 : null,
      notes: clean(cell(row, cols.notes)),
      ...market,
    });
    stats.imported += 1;
  }

  return { items, stats };
}

export function importSpreadsheet(buffer: Buffer, filename: string) {
  const rows = parseSpreadsheet(buffer, filename);
  return importRowsToCollection(rows);
}
