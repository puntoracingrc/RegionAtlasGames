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
  label: string;
  description: string;
  routeHint?: string;
};

export type PriceCustomSourceSetting = {
  id: string;
  label: string;
  url: string;
  routeHint?: string;
  enabled: boolean;
  notes?: string;
};

export type PriceSourceSettings = {
  updatedAt?: string;
  sources: Record<PriceCollectorSourceKey, PriceCollectorSourceSetting>;
  customSources: PriceCustomSourceSetting[];
};

type PlatformSourcesDocument = Record<string, unknown> & {
  collectorSettings?: Partial<PriceSourceSettings>;
};

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
  return (
    (await readPlatformSourcesDocumentFromBlob()) ??
    (await readPlatformSourcesDocumentFromWorker()) ??
    readPlatformSourcesDocumentFromDisk()
  );
}

function normalizeCustomSource(input: unknown): PriceCustomSourceSetting | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Partial<PriceCustomSourceSetting>;
  const label = cleanText(raw.label);
  const url = cleanText(raw.url);
  if (!label || !url) return null;
  const id = cleanText(raw.id) || slugify(label);
  if (!id) return null;
  return {
    id,
    label,
    url,
    routeHint: cleanText(raw.routeHint) || undefined,
    enabled: raw.enabled !== false,
    notes: cleanText(raw.notes) || undefined,
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
    acc[key] = {
      ...DEFAULT_SOURCES[key],
      enabled: current?.enabled ?? DEFAULT_SOURCES[key].enabled,
      label: cleanText(current?.label) || DEFAULT_SOURCES[key].label,
      description: cleanText(current?.description) || DEFAULT_SOURCES[key].description,
      routeHint: cleanText(current?.routeHint) || undefined,
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
    process.env.COVERS_FTP_HOST?.trim() &&
      process.env.COVERS_FTP_USER?.trim() &&
      process.env.COVERS_FTP_PASSWORD?.trim(),
  );
}

async function uploadPlatformSourcesToWorker(document: PlatformSourcesDocument): Promise<void> {
  if (!priceWorkerFtpConfigured()) return;
  const portRaw = process.env.PRICE_WORKER_SSH_PORT?.trim() || process.env.COVERS_FTP_PORT?.trim();
  const port = portRaw && Number.isFinite(Number(portRaw)) ? Number(portRaw) : 22;
  const protocol = process.env.COVERS_FTP_PROTOCOL?.trim().toLowerCase() || (port === 22 ? "sftp" : "ftp");
  if (protocol !== "sftp") {
    throw new Error("La subida remota de fuentes de precios solo soporta SFTP por ahora.");
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
      host: process.env.PRICE_WORKER_SSH_HOST?.trim() || process.env.COVERS_FTP_HOST?.trim(),
      port,
      username: process.env.PRICE_WORKER_SSH_USER?.trim() || process.env.COVERS_FTP_USER?.trim(),
      password: process.env.PRICE_WORKER_SSH_PASSWORD?.trim() || process.env.COVERS_FTP_PASSWORD?.trim(),
      readyTimeout: 60_000,
      retries: 1,
    });
    await client.mkdir(remoteDataRoot, true);
    await client.put(Buffer.from(`${JSON.stringify(document, null, 2)}\n`, "utf8"), remotePath);
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function writePriceSourceSettings(input: unknown): Promise<PriceSourceSettings> {
  const settings = normalizePriceSourceSettings({
    ...(input && typeof input === "object" ? input : {}),
    updatedAt: new Date().toISOString(),
  });
  const document = await readEffectivePlatformSourcesDocument();
  const nextDocument = { ...document, collectorSettings: settings };

  if (canWriteCatalogFiles() || !process.env.VERCEL) {
    const dir = path.dirname(PLATFORM_SOURCES_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(PLATFORM_SOURCES_FILE, `${JSON.stringify(nextDocument, null, 2)}\n`, "utf8");
  }
  await writePlatformSourcesDocumentToBlob(nextDocument);
  await uploadPlatformSourcesToWorker(nextDocument);
  return settings;
}

export const priceCollectorSourceOrder = SOURCE_ORDER;
