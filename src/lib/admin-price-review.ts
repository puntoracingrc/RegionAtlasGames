import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { appDataDir } from "./app-data-dir";
import { canWriteCatalogFiles } from "./admin-auth";
import { clonePublishedCatalogGameToRegion, updatePublishedCatalogPrices } from "./admin-catalog-publish";
import { priceWorkerPublicBaseUrl } from "./admin-price-collect";

const REVIEW_FILE =
  process.env.ADMIN_PRICE_REVIEW_FILE ??
  (process.env.VERCEL
    ? path.join(appDataDir(), "price-review-queue.json")
    : path.join(process.cwd(), "data", "admin", "price-review-queue.json"));

export type PriceReviewStatus = "pending" | "accepted" | "rejected";
export type PriceReviewCondition = "loose" | "game_manual" | "complete" | "sealed" | "unknown";

export type PriceReviewItem = {
  id: string;
  status: PriceReviewStatus;
  source: string;
  platformSlug: string;
  targetRegion?: string | null;
  detectedRegion?: string | null;
  catalogId?: string | null;
  candidateCatalogId?: string | null;
  listingTitle: string;
  priceEur: number;
  condition?: PriceReviewCondition | string | null;
  reason: string;
  evidence?: {
    url?: string | null;
    imageUrl?: string | null;
    imageUrls?: string[] | null;
    regionEvidence?: string[];
    matchMethod?: string | null;
    matchScore?: number | null;
    matchMargin?: number | null;
    matchAlternatives?: Array<{ catalogId?: string; title?: string; region?: string; score?: number }>;
    aiConfidence?: number | null;
    reviewNotes?: string[];
    conditionRaw?: string | null;
  };
  jobId?: string | null;
  collectedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  decidedAt?: string | null;
  decision?: {
    action: "accept" | "reject";
    catalogId?: string | null;
    region?: string | null;
    condition?: PriceReviewCondition | string | null;
    note?: string | null;
  };
};

type PriceReviewQueue = {
  schemaVersion: number;
  updatedAt: string;
  items: PriceReviewItem[];
  decisions: Array<Record<string, unknown>>;
};

export type PriceReviewDecisionInput = {
  action: "accept" | "reject";
  catalogId?: string;
  region?: string;
  condition?: PriceReviewCondition;
  note?: string;
};

export type PriceReviewCloneRegionInput = {
  sourceCatalogId?: string;
  region?: string;
};

function emptyQueue(): PriceReviewQueue {
  return { schemaVersion: 1, updatedAt: new Date().toISOString(), items: [], decisions: [] };
}

function normalizeQueue(input: unknown): PriceReviewQueue {
  const raw = input && typeof input === "object" ? (input as Partial<PriceReviewQueue>) : {};
  const items = Array.isArray(raw.items)
    ? raw.items.filter((item): item is PriceReviewItem => Boolean(item?.id && item?.listingTitle))
    : [];
  return {
    schemaVersion: 1,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    items,
    decisions: Array.isArray(raw.decisions) ? raw.decisions : [],
  };
}

async function readQueueFromWorker(): Promise<PriceReviewQueue | null> {
  const base = priceWorkerPublicBaseUrl();
  if (!base) return null;
  try {
    const response = await fetch(`${base}/app/data/admin/price-review-queue.json`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    return normalizeQueue(await response.json());
  } catch {
    return null;
  }
}

function readQueueFromDisk(): PriceReviewQueue {
  try {
    return normalizeQueue(JSON.parse(readFileSync(REVIEW_FILE, "utf8")));
  } catch {
    return emptyQueue();
  }
}

function priceWorkerRemoteRoot(): string {
  const explicit = process.env.PRICE_WORKER_REMOTE_DIR?.trim();
  if (explicit) return explicit.replace(/^\/+|\/+$/g, "");
  const coversRoot = (process.env.COVERS_FTP_REMOTE_ROOT?.trim() || "MEDIAPUNTORACINGWEB/MEDIAREGIONATLAS/covers")
    .replace(/^\/+|\/+$/g, "");
  if (/\/covers$/i.test(coversRoot)) return coversRoot.replace(/\/covers$/i, "/price-worker");
  return `${coversRoot}/price-worker`;
}

function workerSftpConfig(): { host: string; port: number; username: string; password: string } | null {
  const host = process.env.PRICE_WORKER_SSH_HOST?.trim() || process.env.COVERS_FTP_HOST?.trim();
  const username = process.env.PRICE_WORKER_SSH_USER?.trim() || process.env.COVERS_FTP_USER?.trim();
  const password = process.env.PRICE_WORKER_SSH_PASSWORD?.trim() || process.env.COVERS_FTP_PASSWORD?.trim();
  if (!host || !username || !password) return null;
  const portRaw = process.env.PRICE_WORKER_SSH_PORT?.trim() || process.env.COVERS_FTP_PORT?.trim();
  return { host, port: portRaw ? Number(portRaw) : 22, username, password };
}

async function writeQueue(queue: PriceReviewQueue): Promise<{ workerSynced: boolean; error?: string }> {
  queue.updatedAt = new Date().toISOString();
  if (canWriteCatalogFiles() || !process.env.VERCEL) {
    const dir = path.dirname(REVIEW_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(REVIEW_FILE, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
  }

  const config = workerSftpConfig();
  if (!config) return { workerSynced: false, error: "SFTP del worker no configurado." };
  const mod = (await import("ssh2-sftp-client")) as unknown as {
    default: new () => {
      connect(config: Record<string, unknown>): Promise<void>;
      mkdir(remotePath: string, recursive?: boolean): Promise<void>;
      put(input: Buffer | string, remotePath: string): Promise<void>;
      end(): Promise<void>;
    };
  };
  const client = new mod.default();
  const remotePath = path.posix.join(priceWorkerRemoteRoot(), "app", "data", "admin", "price-review-queue.json");
  try {
    await client.connect({ ...config, readyTimeout: 60_000, retries: 1 });
    await client.mkdir(path.posix.dirname(remotePath), true);
    await client.put(Buffer.from(`${JSON.stringify(queue, null, 2)}\n`, "utf8"), remotePath);
    return { workerSynced: true };
  } catch (error) {
    return { workerSynced: false, error: error instanceof Error ? error.message : "No se pudo sincronizar el worker." };
  } finally {
    await client.end().catch(() => undefined);
  }
}

function conditionPatchField(condition: string | null | undefined): string {
  if (condition === "loose") return "estimatedPriceLoose";
  if (condition === "game_manual") return "estimatedPriceGameManual";
  if (condition === "sealed") return "estimatedPriceSealed";
  return "estimatedPriceComplete";
}

function sourceLabel(source: string): string {
  return source
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function patchFromReview(item: PriceReviewItem, input: PriceReviewDecisionInput): Partial<Record<string, unknown>> {
  const catalogId = input.catalogId?.trim() || item.catalogId || item.candidateCatalogId;
  const condition = input.condition || item.condition || "complete";
  const price = Number(item.priceEur);
  const source = sourceLabel(item.source);
  const field = conditionPatchField(condition);
  return {
    [field]: price,
    recommendedPrice: price,
    marketMin: price,
    marketMax: price,
    hasEsPrice: true,
    priceRegionVerified: true,
    priceSource: source,
    priceDataSources: source,
    ...(item.evidence?.url ? { [`${item.source}ProductUrl`]: item.evidence.url } : {}),
    ...(catalogId ? { catalogId } : {}),
  };
}

export async function listPriceReviewItems(limit = 40): Promise<PriceReviewItem[]> {
  const queue = (await readQueueFromWorker()) ?? readQueueFromDisk();
  return queue.items
    .filter((item) => item.status === "pending")
    .sort((a, b) => Date.parse(b.updatedAt ?? b.createdAt ?? "") - Date.parse(a.updatedAt ?? a.createdAt ?? ""))
    .slice(0, limit);
}

export async function decidePriceReviewItem(
  id: string,
  input: PriceReviewDecisionInput,
): Promise<{ ok: true; item: PriceReviewItem; workerSynced: boolean; apply?: unknown } | { error: string }> {
  const queue = (await readQueueFromWorker()) ?? readQueueFromDisk();
  const index = queue.items.findIndex((item) => item.id === id);
  if (index < 0) return { error: "Pendiente no encontrado." };
  const item = queue.items[index];
  const now = new Date().toISOString();

  let apply: unknown;
  if (input.action === "accept") {
    const catalogId = input.catalogId?.trim() || item.catalogId || item.candidateCatalogId;
    if (!catalogId) return { error: "Falta juego destino para aceptar." };
    const patch = patchFromReview(item, input);
    const result = await updatePublishedCatalogPrices(catalogId, patch);
    if ("error" in result) return { error: result.error };
    apply = result;
  }

  const nextItem: PriceReviewItem = {
    ...item,
    status: input.action === "accept" ? "accepted" : "rejected",
    decidedAt: now,
    updatedAt: now,
    decision: {
      action: input.action,
      catalogId: input.catalogId?.trim() || item.catalogId || item.candidateCatalogId || null,
      region: input.region?.trim() || item.targetRegion || item.detectedRegion || null,
      condition: input.condition || item.condition || null,
      note: input.note?.trim() || null,
    },
  };
  queue.items[index] = nextItem;
  queue.decisions = [
    { id, at: now, ...nextItem.decision },
    ...queue.decisions,
  ].slice(0, 1000);
  const write = await writeQueue(queue);
  return { ok: true, item: nextItem, workerSynced: write.workerSynced, apply };
}

export async function clonePriceReviewCatalogRegion(
  id: string,
  input: PriceReviewCloneRegionInput,
): Promise<
  | {
      ok: true;
      item: PriceReviewItem;
      catalogId: string;
      region: string;
      url: string;
      workerSynced: boolean;
      clone: unknown;
    }
  | { error: string }
> {
  const queue = (await readQueueFromWorker()) ?? readQueueFromDisk();
  const index = queue.items.findIndex((item) => item.id === id);
  if (index < 0) return { error: "Pendiente no encontrado." };
  const item = queue.items[index];
  const sourceCatalogId = input.sourceCatalogId?.trim() || item.catalogId || item.candidateCatalogId || "";
  const region = input.region?.trim() || item.targetRegion || item.detectedRegion || "";
  if (!sourceCatalogId) return { error: "Elige la ficha base para clonar." };
  if (!region) return { error: "Elige la región nueva." };

  const clone = await clonePublishedCatalogGameToRegion({ sourceCatalogId, region });
  if ("error" in clone) return clone;

  const now = new Date().toISOString();
  const nextItem: PriceReviewItem = {
    ...item,
    catalogId: clone.catalogId,
    candidateCatalogId: clone.catalogId,
    targetRegion: region,
    updatedAt: now,
    evidence: {
      ...(item.evidence ?? {}),
      reviewNotes: [
        ...(item.evidence?.reviewNotes ?? []),
        `Ficha creada desde ${sourceCatalogId} para región ${region}`,
      ],
      matchAlternatives: [
        { catalogId: clone.catalogId, title: item.listingTitle, region, score: 1 },
        ...(item.evidence?.matchAlternatives ?? []),
      ],
    },
  };
  queue.items[index] = nextItem;
  const write = await writeQueue(queue);
  return {
    ok: true,
    item: nextItem,
    catalogId: clone.catalogId,
    region,
    url: clone.url,
    workerSynced: write.workerSynced,
    clone,
  };
}
