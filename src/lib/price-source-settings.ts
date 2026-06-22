import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { get, put } from "@vercel/blob";
import { canWriteCatalogFiles } from "./admin-auth";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";

const PLATFORM_SOURCES_FILE = path.join(process.cwd(), "data", "platform-sources.json");
const PLATFORM_SOURCES_BLOB_PATH = "region-atlas/admin/price-sources/platform-sources.json";

export type PriceCollectorSourceKey =
  | "wallapop"
  | "ebay"
  | "vinted"
  | "cex"
  | "jgo"
  | "chollo"
  | "kaoto"
  | "todoconsolas"
  | "todocoleccion";

export type PriceCollectorSourceSetting = {
  enabled: boolean;
  enabledManual?: boolean;
  enabledRotation?: boolean;
  label: string;
  description: string;
  routeHint?: string;
  strategy?: PriceSourceStrategy;
  status?: PriceSourceStatus;
  queryTemplate?: string;
  urlTemplate?: string;
  normalizations?: PriceSourceNormalization[];
  enabledPlatforms?: string[];
  disabledPlatforms?: string[];
  enabledRegions?: string[];
  disabledRegions?: string[];
  supportUrl?: string;
  platformRoutes?: Record<string, string>;
  crawlMode?: PriceSourceCrawlMode;
  paginationTemplate?: string;
  offsetEndpoint?: string;
  categoryParam?: string;
  categoryValue?: string;
  offsetParam?: string;
  pageSizeParam?: string;
  pageSize?: number;
  requestHeaders?: Record<string, string>;
  productUrlIncludePatterns?: string[];
  productUrlExcludePatterns?: string[];
  maxPages?: number;
  maxScrolls?: number;
  maxProducts?: number;
  unlimitedProducts?: boolean;
  timeoutSeconds?: number;
  notes?: string;
};

export type PriceCustomSourceSetting = {
  id: string;
  label: string;
  url: string;
  routeHint?: string;
  enabled: boolean;
  enabledManual?: boolean;
  enabledRotation?: boolean;
  notes?: string;
  strategy?: PriceSourceStrategy;
  status?: PriceSourceStatus;
  queryTemplate?: string;
  urlTemplate?: string;
  normalizations?: PriceSourceNormalization[];
  enabledPlatforms?: string[];
  disabledPlatforms?: string[];
  enabledRegions?: string[];
  disabledRegions?: string[];
  platformRoutes?: Record<string, string>;
  crawlMode?: PriceSourceCrawlMode;
  paginationTemplate?: string;
  offsetEndpoint?: string;
  categoryParam?: string;
  categoryValue?: string;
  offsetParam?: string;
  pageSizeParam?: string;
  pageSize?: number;
  requestHeaders?: Record<string, string>;
  productUrlIncludePatterns?: string[];
  productUrlExcludePatterns?: string[];
  maxPages?: number;
  maxScrolls?: number;
  maxProducts?: number;
  unlimitedProducts?: boolean;
  timeoutSeconds?: number;
};

export type PriceSourceSettings = {
  updatedAt?: string;
  sources: Record<PriceCollectorSourceKey, PriceCollectorSourceSetting>;
  customSources: PriceCustomSourceSetting[];
};

type PlatformSourcesDocument = Record<string, unknown> & {
  collectorSettings?: Partial<PriceSourceSettings>;
};

export type PriceSourceWorkerSyncStatus =
  | { ok: true; remotePath: string; uploadedAt: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; reason: string };

export type PriceSourceSettingsWriteResult = {
  settings: PriceSourceSettings;
  worker: PriceSourceWorkerSyncStatus;
};

export type PriceSourceStrategy =
  | "catalog_crawl"
  | "base_url"
  | "platform_routes"
  | "internal_search"
  | "sequence"
  | "api"
  | "manual_candidate";

export type PriceSourceStatus =
  | "active"
  | "candidate"
  | "needs_review"
  | "blocked_403"
  | "blocked_429"
  | "disabled";

export type PriceSourceNormalization =
  | "decode_html_entities"
  | "strip_region"
  | "strip_platform"
  | "trim_edition"
  | "title_only"
  | "keep_title_color_word";

export type PriceSourceCrawlMode =
  | "static_catalog"
  | "pagination"
  | "pagination_url"
  | "offset_pagination"
  | "infinite_scroll"
  | "load_more_button"
  | "internal_search";

const DEFAULT_SOURCES: Record<PriceCollectorSourceKey, PriceCollectorSourceSetting> = {
  wallapop: {
    enabled: true,
    label: "Wallapop",
    description: "P2P España. Ahora mismo es la fuente principal para precio de mercado.",
  },
  ebay: {
    enabled: false,
    label: "eBay",
    description: "API directa y afiliación. Fuera de la rueda automática; sus precios válidos pueden contar en la base.",
  },
  vinted: {
    enabled: false,
    label: "Vinted",
    description: "P2P secundario. Apagado por defecto hasta estabilizar resultados.",
  },
  cex: {
    enabled: true,
    label: "CeX",
    description: "Referencia retail con compra/venta; no entra igual que P2P.",
  },
  jgo: {
    enabled: true,
    label: "JGO",
    description: "Japan Game Online. Útil como referencia import/retro.",
  },
  chollo: {
    enabled: true,
    label: "Chollo Games",
    description: "Referencia retail/importación cuando hay categoría configurada.",
  },
  kaoto: {
    enabled: true,
    label: "Kaoto Store",
    description: "Referencia retail/importación, especialmente Japón.",
  },
  todoconsolas: {
    enabled: true,
    label: "TodoConsolas",
    description: "Referencia retail española cuando existe ruta de plataforma.",
  },
  todocoleccion: {
    enabled: false,
    label: "TodoColeccion",
    description: "Apagado por defecto: mete ruido y conviene activarlo solo cuando interese.",
  },
};

const SOURCE_ORDER: PriceCollectorSourceKey[] = [
  "wallapop",
  "ebay",
  "vinted",
  "cex",
  "jgo",
  "chollo",
  "kaoto",
  "todoconsolas",
  "todocoleccion",
];

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanTextList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const clean: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const text = cleanText(item);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    clean.push(text);
  }
  return clean;
}

function cleanStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const cleanKey = cleanText(key).toLowerCase();
    const cleanValue = cleanText(rawValue);
    if (cleanKey && cleanValue) out[cleanKey] = cleanValue;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const SOURCE_STRATEGIES: PriceSourceStrategy[] = [
  "catalog_crawl",
  "base_url",
  "platform_routes",
  "internal_search",
  "sequence",
  "api",
  "manual_candidate",
];

const SOURCE_STATUSES: PriceSourceStatus[] = [
  "active",
  "candidate",
  "needs_review",
  "blocked_403",
  "blocked_429",
  "disabled",
];

const SOURCE_NORMALIZATIONS: PriceSourceNormalization[] = [
  "decode_html_entities",
  "strip_region",
  "strip_platform",
  "trim_edition",
  "title_only",
  "keep_title_color_word",
];

const SOURCE_CRAWL_MODES: PriceSourceCrawlMode[] = [
  "static_catalog",
  "pagination",
  "pagination_url",
  "offset_pagination",
  "infinite_scroll",
  "load_more_button",
  "internal_search",
];

function cleanStrategy(value: unknown, fallback: PriceSourceStrategy): PriceSourceStrategy {
  return SOURCE_STRATEGIES.includes(value as PriceSourceStrategy) ? (value as PriceSourceStrategy) : fallback;
}

function cleanStatus(value: unknown, fallback: PriceSourceStatus): PriceSourceStatus {
  return SOURCE_STATUSES.includes(value as PriceSourceStatus) ? (value as PriceSourceStatus) : fallback;
}

function cleanNormalizations(value: unknown, fallback: PriceSourceNormalization[]): PriceSourceNormalization[] {
  const raw = cleanTextList(value);
  const clean = raw.filter((item): item is PriceSourceNormalization =>
    SOURCE_NORMALIZATIONS.includes(item as PriceSourceNormalization),
  );
  return clean.length > 0 ? clean : fallback;
}

function cleanCrawlMode(value: unknown, fallback: PriceSourceCrawlMode): PriceSourceCrawlMode {
  return SOURCE_CRAWL_MODES.includes(value as PriceSourceCrawlMode) ? (value as PriceSourceCrawlMode) : fallback;
}

function cleanPositiveInt(value: unknown): number | undefined {
  const numberValue = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return undefined;
  return Math.floor(numberValue);
}

function cleanBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeSourceDetails<T extends PriceCollectorSourceSetting | PriceCustomSourceSetting>(
  raw: Partial<T>,
  fallback: {
    strategy: PriceSourceStrategy;
    status: PriceSourceStatus;
    normalizations: PriceSourceNormalization[];
  },
) {
  const enabledPlatforms = cleanTextList(raw.enabledPlatforms);
  const disabledPlatforms = cleanTextList(raw.disabledPlatforms);
  const enabledRegions = cleanTextList(raw.enabledRegions);
  const disabledRegions = cleanTextList(raw.disabledRegions);
  return {
    strategy: cleanStrategy(raw.strategy, fallback.strategy),
    status: cleanStatus(raw.status, fallback.status),
    queryTemplate: cleanText(raw.queryTemplate) || undefined,
    urlTemplate: cleanText(raw.urlTemplate) || undefined,
    crawlMode: cleanCrawlMode(raw.crawlMode, raw.strategy === "internal_search" ? "internal_search" : "static_catalog"),
    paginationTemplate: cleanText(raw.paginationTemplate) || undefined,
    offsetEndpoint: cleanText(raw.offsetEndpoint) || undefined,
    categoryParam: cleanText(raw.categoryParam) || undefined,
    categoryValue: cleanText(raw.categoryValue) || undefined,
    offsetParam: cleanText(raw.offsetParam) || undefined,
    pageSizeParam: cleanText(raw.pageSizeParam) || undefined,
    pageSize: cleanPositiveInt(raw.pageSize),
    maxPages: cleanPositiveInt(raw.maxPages),
    maxScrolls: cleanPositiveInt(raw.maxScrolls),
    maxProducts: cleanPositiveInt(raw.maxProducts),
    unlimitedProducts: cleanBoolean(raw.unlimitedProducts, false),
    timeoutSeconds: cleanPositiveInt(raw.timeoutSeconds),
    normalizations: cleanNormalizations(raw.normalizations, fallback.normalizations),
    enabledPlatforms: enabledPlatforms.length > 0 ? enabledPlatforms : undefined,
    disabledPlatforms: disabledPlatforms.length > 0 ? disabledPlatforms : undefined,
    enabledRegions: enabledRegions.length > 0 ? enabledRegions : undefined,
    disabledRegions: disabledRegions.length > 0 ? disabledRegions : undefined,
    platformRoutes: cleanStringRecord(raw.platformRoutes),
    requestHeaders: cleanStringRecord(raw.requestHeaders),
    productUrlIncludePatterns: cleanTextList(raw.productUrlIncludePatterns),
    productUrlExcludePatterns: cleanTextList(raw.productUrlExcludePatterns),
  };
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readPlatformSourcesDocumentFromDisk(): PlatformSourcesDocument {
  try {
    return JSON.parse(readFileSync(PLATFORM_SOURCES_FILE, "utf8")) as PlatformSourcesDocument;
  } catch {
    return { schemaVersion: 1, platforms: {} };
  }
}

function shouldUseBlobStorage(): boolean {
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return true;
  return blobAuthConfigured();
}

async function readPlatformSourcesDocumentFromBlob(): Promise<PlatformSourcesDocument | null> {
  if (!shouldUseBlobStorage()) return null;
  try {
    const auth = await blobAuthOptions("private");
    const result = await get(PLATFORM_SOURCES_BLOB_PATH, { ...auth, useCache: false });
    if (!result?.stream || result.statusCode !== 200) return null;
    return JSON.parse(await new Response(result.stream).text()) as PlatformSourcesDocument;
  } catch {
    return null;
  }
}

async function writePlatformSourcesDocumentToBlob(document: PlatformSourcesDocument): Promise<void> {
  if (!shouldUseBlobStorage()) return;
  const auth = await blobAuthOptions("private");
  await put(PLATFORM_SOURCES_BLOB_PATH, JSON.stringify(document, null, 2), {
    ...auth,
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 30,
  });
}

function priceWorkerPublicBaseUrl(): string | null {
  const explicit = process.env.PRICE_WORKER_PUBLIC_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const coversBase = process.env.NEXT_PUBLIC_COVERS_BASE_URL?.trim();
  if (!coversBase) return "https://www.puntoracing.net/MEDIAREGIONATLAS/price-worker";
  return coversBase.replace(/\/covers\/?$/i, "/price-worker").replace(/\/$/, "");
}

async function readPlatformSourcesDocumentFromWorker(): Promise<PlatformSourcesDocument | null> {
  const base = priceWorkerPublicBaseUrl();
  if (!base) return null;
  try {
    const response = await fetch(`${base}/app/data/platform-sources.json`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    return (await response.json()) as PlatformSourcesDocument;
  } catch {
    return null;
  }
}

export async function readEffectivePlatformSourcesDocument(): Promise<PlatformSourcesDocument> {
  return readBestPlatformSourcesDocument();
}

function collectorSettingsUpdatedAt(document: PlatformSourcesDocument | null): number {
  const raw = document?.collectorSettings;
  if (!raw || typeof raw !== "object") return 0;
  const value = cleanText((raw as Partial<PriceSourceSettings>).updatedAt);
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function readBestPlatformSourcesDocument(): Promise<PlatformSourcesDocument> {
  const worker = await readPlatformSourcesDocumentFromWorker();
  const blob = await readPlatformSourcesDocumentFromBlob();
  const disk = readPlatformSourcesDocumentFromDisk();
  const candidates = [worker, blob, disk].filter((item): item is PlatformSourcesDocument => Boolean(item));
  const dated = candidates
    .map((document, index) => ({ document, index, updatedAt: collectorSettingsUpdatedAt(document) }))
    .sort((a, b) => b.updatedAt - a.updatedAt || a.index - b.index);
  return dated[0]?.document ?? disk;
}

function normalizeCustomSource(input: unknown): PriceCustomSourceSetting | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Partial<PriceCustomSourceSetting>;
  const label = cleanText(raw.label);
  const url = cleanText(raw.url);
  if (!label || !url) return null;
  const id = cleanText(raw.id) || slugify(label);
  if (!id) return null;
  const legacyEnabled = raw.enabled !== false;
  return {
    id,
    label,
    url,
    routeHint: cleanText(raw.routeHint) || undefined,
    enabled: legacyEnabled,
    enabledManual: cleanBoolean(raw.enabledManual, legacyEnabled),
    enabledRotation: cleanBoolean(raw.enabledRotation, legacyEnabled),
    notes: cleanText(raw.notes) || undefined,
    ...normalizeSourceDetails(raw, {
      strategy: "manual_candidate",
      status: raw.enabled === false ? "disabled" : "candidate",
      normalizations: ["decode_html_entities", "title_only"],
    }),
  };
}

export function normalizePriceSourceSettings(input: unknown): PriceSourceSettings {
  const raw = input && typeof input === "object" ? (input as Partial<PriceSourceSettings>) : {};
  const rawSources =
    raw.sources && typeof raw.sources === "object"
      ? (raw.sources as Partial<Record<PriceCollectorSourceKey, Partial<PriceCollectorSourceSetting>>>)
      : {};
  const sources = SOURCE_ORDER.reduce((acc, key) => {
    const current = rawSources[key];
    const legacyEnabled = current?.enabled ?? DEFAULT_SOURCES[key].enabled;
    acc[key] = {
      ...DEFAULT_SOURCES[key],
      enabled: legacyEnabled,
      enabledManual: cleanBoolean(current?.enabledManual, legacyEnabled),
      enabledRotation: cleanBoolean(current?.enabledRotation, legacyEnabled),
      label: cleanText(current?.label) || DEFAULT_SOURCES[key].label,
      description: cleanText(current?.description) || DEFAULT_SOURCES[key].description,
      routeHint: cleanText(current?.routeHint) || undefined,
      supportUrl: cleanText(current?.supportUrl) || undefined,
      notes: cleanText(current?.notes) || undefined,
      ...normalizeSourceDetails(current ?? {}, {
        strategy: key === "ebay" ? "api" : key === "chollo" ? "catalog_crawl" : "internal_search",
        status: current?.enabled === false ? "disabled" : "active",
        normalizations: ["decode_html_entities", "title_only"],
      }),
    };
    return acc;
  }, {} as Record<PriceCollectorSourceKey, PriceCollectorSourceSetting>);

  const customSources = Array.isArray(raw.customSources)
    ? raw.customSources.map(normalizeCustomSource).filter((item): item is PriceCustomSourceSetting => Boolean(item))
    : [];

  return {
    updatedAt: cleanText(raw.updatedAt) || undefined,
    sources,
    customSources,
  };
}

export async function readPriceSourceSettings(): Promise<PriceSourceSettings> {
  const document = await readEffectivePlatformSourcesDocument();
  return normalizePriceSourceSettings(document.collectorSettings);
}

function priceWorkerRemoteRoot(): string {
  const explicit = process.env.PRICE_WORKER_REMOTE_DIR?.trim();
  if (explicit) return explicit.replace(/^\/+|\/+$/g, "");
  const coversRoot = (process.env.COVERS_FTP_REMOTE_ROOT?.trim() || "MEDIAPUNTORACINGWEB/MEDIAREGIONATLAS/covers")
    .replace(/^\/+|\/+$/g, "");
  if (/\/covers$/i.test(coversRoot)) return coversRoot.replace(/\/covers$/i, "/price-worker");
  return `${coversRoot}/price-worker`;
}

function priceWorkerFtpConfigured(): boolean {
  return Boolean(
    (process.env.PRICE_WORKER_SFTP_HOST?.trim() || process.env.COVERS_FTP_HOST?.trim() || process.env.PRICE_WORKER_SSH_HOST?.trim()) &&
      (process.env.PRICE_WORKER_SFTP_USER?.trim() || process.env.COVERS_FTP_USER?.trim() || process.env.PRICE_WORKER_SSH_USER?.trim()) &&
      (process.env.PRICE_WORKER_SFTP_PASSWORD?.trim() || process.env.COVERS_FTP_PASSWORD?.trim() || process.env.PRICE_WORKER_SSH_PASSWORD?.trim()),
  );
}

async function uploadPlatformSourcesToWorker(document: PlatformSourcesDocument): Promise<PriceSourceWorkerSyncStatus> {
  if (!priceWorkerFtpConfigured()) {
    return { ok: false, skipped: true, reason: "FTP/SFTP del worker externo no configurado." };
  }
  const portRaw = process.env.PRICE_WORKER_SFTP_PORT?.trim() || process.env.COVERS_FTP_PORT?.trim() || process.env.PRICE_WORKER_SSH_PORT?.trim();
  const port = portRaw && Number.isFinite(Number(portRaw)) ? Number(portRaw) : 22;
  const protocol = process.env.COVERS_FTP_PROTOCOL?.trim().toLowerCase() || (port === 22 ? "sftp" : "ftp");
  if (protocol !== "sftp") {
    return { ok: false, reason: "La subida remota de fuentes de precios solo soporta SFTP por ahora." };
  }

  const mod = (await import("ssh2-sftp-client")) as unknown as { default: new () => {
    connect(config: Record<string, unknown>): Promise<void>;
    mkdir(remotePath: string, recursive?: boolean): Promise<void>;
    put(input: Buffer | string, remotePath: string): Promise<void>;
    end(): Promise<void>;
  } };
  const client = new mod.default();
  const remoteRoot = priceWorkerRemoteRoot();
  const remoteDataRoot = path.posix.join(remoteRoot, "app", "data");
  const remotePath = path.posix.join(remoteDataRoot, "platform-sources.json");
  try {
    await client.connect({
      host: process.env.PRICE_WORKER_SFTP_HOST?.trim() || process.env.COVERS_FTP_HOST?.trim() || process.env.PRICE_WORKER_SSH_HOST?.trim(),
      port,
      username: process.env.PRICE_WORKER_SFTP_USER?.trim() || process.env.COVERS_FTP_USER?.trim() || process.env.PRICE_WORKER_SSH_USER?.trim(),
      password: process.env.PRICE_WORKER_SFTP_PASSWORD?.trim() || process.env.COVERS_FTP_PASSWORD?.trim() || process.env.PRICE_WORKER_SSH_PASSWORD?.trim(),
      readyTimeout: 60_000,
      retries: 1,
    });
    await client.mkdir(remoteDataRoot, true);
    await client.put(Buffer.from(`${JSON.stringify(document, null, 2)}\n`, "utf8"), remotePath);
    return { ok: true, remotePath, uploadedAt: new Date().toISOString() };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "No se pudo sincronizar el worker externo." };
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function writePriceSourceSettings(input: unknown): Promise<PriceSourceSettingsWriteResult> {
  const settings = normalizePriceSourceSettings({
    ...(input && typeof input === "object" ? input : {}),
    updatedAt: new Date().toISOString(),
  });
  const document = await readBestPlatformSourcesDocument();
  const nextDocument = { ...document, collectorSettings: settings };

  if (canWriteCatalogFiles() || !process.env.VERCEL) {
    const dir = path.dirname(PLATFORM_SOURCES_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(PLATFORM_SOURCES_FILE, `${JSON.stringify(nextDocument, null, 2)}\n`, "utf8");
  }
  await writePlatformSourcesDocumentToBlob(nextDocument);
  const worker = await uploadPlatformSourcesToWorker(nextDocument);
  return { settings, worker };
}

export const priceCollectorSourceOrder = SOURCE_ORDER;
