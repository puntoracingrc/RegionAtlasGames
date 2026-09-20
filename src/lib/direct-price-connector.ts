import { createHash, timingSafeEqual } from "node:crypto";
import type { CatalogGame } from "./types";

export class PriceConnectorError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type PriceCondition = "loose" | "complete" | "sealed";
export type PriceObservation = { listingId: string; url: string; priceEur: number };
export type PriceSubmission = {
  schemaVersion: 1; batchId: string; catalogId: string; catalogTitle: string;
  platformSlug: string; region: string; currency: "EUR"; taskId: string;
  conditions: { state: PriceCondition; meanEur: number; listings: PriceObservation[] }[];
};
export type PriceReceipt = {
  batchId: string; digest: string; catalogId: string; taskId: string; publishedAt: string;
  conditions: { state: PriceCondition; before: number | null; mean: number; after: number; listings: PriceObservation[] }[];
};
export type PriceConnectorGame = CatalogGame & { priceConnectorReceipts?: PriceReceipt[] };
const FIELDS = { loose: "estimatedPriceLoose", complete: "estimatedPriceComplete", sealed: "estimatedPriceSealed" } as const;
const SHIPPING_FIELDS = { loose: "estimatedShippingToSpainLoose", complete: "estimatedShippingToSpainComplete", sealed: "estimatedShippingToSpainSealed" } as const;
const TOTAL_FIELDS = { loose: "estimatedTotalToSpainLoose", complete: "estimatedTotalToSpainComplete", sealed: "estimatedTotalToSpainSealed" } as const;
const ALL_FIELDS = ["estimatedPriceComplete", "estimatedPriceGameManual", "estimatedPriceLoose", "estimatedPriceSealed", "estimatedPriceNewRetail"] as const;

function fail(message: string): never { throw new PriceConnectorError(400, message); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Objeto JSON no válido.");
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some(key => !keys.includes(key))) fail("El documento contiene campos no admitidos.");
}
function text(value: unknown, name: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) fail(`${name} no válido.`);
  return value.trim();
}
export function euroCents(value: unknown): number {
  if ((typeof value !== "number" && typeof value !== "string") || !/^\d{1,7}(\.\d{1,2})?$/.test(String(value))) fail("Precio EUR no válido; usar como máximo dos decimales.");
  const [whole, decimals = ""] = String(value).split(".");
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0) fail("El precio debe ser positivo.");
  return cents;
}
export function meanEuro(listings: PriceObservation[]): number {
  // Input bounds keep the integer numerator below Number.MAX_SAFE_INTEGER.
  const sum = listings.reduce((total, row) => total + euroCents(row.priceEur), 0);
  const count = listings.length;
  return Math.floor((sum * 2 + count) / (count * 2)) / 100;
}
export function parsePriceSubmission(raw: unknown): PriceSubmission {
  const body = object(raw);
  exactKeys(body, ["schemaVersion", "batchId", "catalogId", "catalogTitle", "platformSlug", "region", "currency", "taskId", "conditions"]);
  if (body.schemaVersion !== 1 || body.currency !== "EUR") fail("Se requiere schemaVersion 1 y moneda EUR.");
  const catalogId = text(body.catalogId, "catalogId", 250);
  if (/[\\/]/.test(catalogId) || /%(2f|5c|2e)/i.test(catalogId) || catalogId.includes("..")) fail("catalogId no válido.");
  const batchId = text(body.batchId, "batchId", 120);
  if (!/^[a-zA-Z0-9_-]+$/.test(batchId)) fail("batchId no válido.");
  if (!Array.isArray(body.conditions) || !body.conditions.length || body.conditions.length > 3) fail("Se requiere al menos un estado loose/complete/sealed.");
  const ids = new Set<string>();
  const states = new Set<string>();
  const conditions = body.conditions.map(rawCondition => {
    const row = object(rawCondition);
    exactKeys(row, ["state", "meanEur", "listings"]);
    if (row.state !== "loose" && row.state !== "complete" && row.state !== "sealed") fail("Estado no admitido.");
    const state: PriceCondition = row.state;
    if (states.has(state)) fail("Estado repetido.");
    states.add(state);
    if (!Array.isArray(row.listings) || !row.listings.length || row.listings.length > 500) fail("Cada estado necesita entre 1 y 500 anuncios.");
    const listings = row.listings.map(rawListing => {
      const listing = object(rawListing);
      exactKeys(listing, ["listingId", "url", "priceEur"]);
      const listingId = text(listing.listingId, "listingId", 160);
      if (ids.has(listingId)) fail("El mismo anuncio está repetido en la solicitud.");
      ids.add(listingId);
      const url = text(listing.url, "url", 2048);
      let parsed: URL;
      try { parsed = new URL(url); } catch { return fail("URL de evidencia no válida."); }
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) fail("La evidencia debe tener una URL HTTPS sin credenciales.");
      return { listingId, url, priceEur: euroCents(listing.priceEur) / 100 };
    }).sort((a, b) => a.listingId.localeCompare(b.listingId, "en"));
    const meanEur = euroCents(row.meanEur) / 100;
    if (meanEuro(listings) !== meanEur) fail("La media declarada no coincide con los anuncios aceptados.");
    return { state, meanEur, listings };
  }).sort((a, b) => a.state.localeCompare(b.state, "en"));
  return { schemaVersion: 1, batchId, catalogId, catalogTitle: text(body.catalogTitle, "catalogTitle", 500), platformSlug: text(body.platformSlug, "platformSlug", 50), region: text(body.region, "region", 100), currency: "EUR", taskId: text(body.taskId, "taskId", 160), conditions };
}

export function authorizePriceConnector(request: Request, env: Record<string, string | undefined> = process.env): void {
  if (env.PRICE_CONNECTOR_ENABLED !== "1" || !/^[a-f0-9]{64}$/.test(env.PRICE_CONNECTOR_TOKEN_SHA256 ?? "")) throw new PriceConnectorError(503, "Conector no configurado.");
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token.length < 32 || token.length > 512 || !timingSafeEqual(createHash("sha256").update(token).digest(), Buffer.from(env.PRICE_CONNECTOR_TOKEN_SHA256!, "hex"))) throw new PriceConnectorError(401, "No autorizado.");
}

function oldPrice(game: CatalogGame, state: PriceCondition): number | null {
  let value = game[FIELDS[state]];
  if (value == null && state === "complete" && ALL_FIELDS.every(field => game[field] == null)) value = game.recommendedPrice;
  if (value == null) return null;
  if (!Number.isFinite(value) || value <= 0) throw new PriceConnectorError(409, "El precio previo requiere revisión; no se puede combinar automáticamente.");
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
function appendLabel(previous: string | null | undefined): string {
  return [...new Set([...(previous ?? "").split("·").map(s => s.trim()).filter(Boolean), "Estimación provisional"])].join(" · ");
}
export function planDirectPrice(game: PriceConnectorGame, input: PriceSubmission, now: string): {
  game: PriceConnectorGame; receipt: PriceReceipt; alreadyApplied: boolean;
} {
  if (game.id !== input.catalogId || game.title !== input.catalogTitle || game.platformSlug !== input.platformSlug || game.region !== input.region) throw new PriceConnectorError(409, "La ficha, edición, plataforma o región ya no coincide con el lote.");
  const digest = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const receipts = game.priceConnectorReceipts ?? [];
  const existing = receipts.find(receipt => receipt.batchId === input.batchId);
  if (existing) {
    if (existing.digest !== digest) throw new PriceConnectorError(409, "Ese batchId ya se publicó con otro contenido.");
    return { game, receipt: existing, alreadyApplied: true };
  }
  const publishedIds = new Set(receipts.flatMap(receipt => receipt.conditions.flatMap(condition => condition.listings.map(row => row.listingId))));
  if (input.conditions.some(condition => condition.listings.some(row => publishedIds.has(row.listingId)))) throw new PriceConnectorError(409, "El lote contiene anuncios que ya se incorporaron a esta ficha; no se promediarán dos veces.");
  // Snapshot all previous values before changing either state (including legacy recommendedPrice).
  const conditions = input.conditions.map(condition => {
    const before = oldPrice(game, condition.state);
    const mean = condition.meanEur;
    const after = before == null ? mean : Math.floor((euroCents(before) + euroCents(mean) + 1) / 2) / 100;
    return { state: condition.state, before, mean, after, listings: condition.listings };
  });
  const next = { ...game };
  if (!input.conditions.some(row => row.state === "complete") && ALL_FIELDS.every(field => game[field] == null) && game.recommendedPrice != null) next.estimatedPriceComplete = oldPrice(game, "complete");
  for (const condition of conditions) {
    next[FIELDS[condition.state]] = condition.after;
    const shipping = game[SHIPPING_FIELDS[condition.state]];
    if (shipping != null && Number.isFinite(shipping) && shipping >= 0) {
      const total = Math.round((condition.after + shipping + Number.EPSILON) * 100) / 100;
      next[TOTAL_FIELDS[condition.state]] = total;
    }
  }
  const values = ALL_FIELDS.map(field => next[field]).filter((value): value is number => value != null);
  next.recommendedPrice = values[0] ?? null;
  next.marketMin = values.length ? Math.min(...values) : null;
  next.marketMax = values.length ? Math.max(...values) : null;
  next.hasEsPrice = next.region === "PAL España" && values.length > 0;
  next.priceRegionVerified = game.priceRegionVerified === true && game.recommendedPrice === next.recommendedPrice;
  next.priceSource = appendLabel(game.priceSource);
  next.priceDataSources = appendLabel(game.priceDataSources);
  next.updatedAt = now;
  if (next.recommendedPrice != null && next.pcRefPrice != null && next.pcRefPrice > 0) next.deltaEsVsPc = Math.round((next.recommendedPrice - next.pcRefPrice) / next.pcRefPrice * 1000) / 10;
  const receipt: PriceReceipt = { batchId: input.batchId, digest, catalogId: game.id, taskId: input.taskId, publishedAt: now, conditions };
  next.priceConnectorReceipts = [...receipts, receipt];
  return { game: next, receipt, alreadyApplied: false };
}

/** Existing admin editors must not erase the connector's idempotency ledger. */
export function preserveDirectPriceReceipts(current: PriceConnectorGame | null, incoming: CatalogGame): PriceConnectorGame {
  return current?.priceConnectorReceipts?.length ? { ...incoming, priceConnectorReceipts: current.priceConnectorReceipts } : incoming;
}
