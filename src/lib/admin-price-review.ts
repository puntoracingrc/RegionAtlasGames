import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { appDataDir } from "./app-data-dir";
import { canWriteCatalogFiles } from "./admin-auth";
import { clonePublishedCatalogGameToRegion, mergePublishedCatalogGames, updatePublishedCatalogPrices } from "./admin-catalog-publish";
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

export type PriceReviewMergeCatalogInput = {
  catalogIds?: string[];
};

export type PriceReviewAutoRetroplayzoneInput = {
  apply?: boolean;
};

export type PriceReviewAutoRetroplayzoneCandidate = {
  id: string;
  listingTitle: string;
  catalogId: string | null;
  region: string | null;
  condition: PriceReviewCondition | null;
  priceEur: number;
  decision: "accept" | "skip";
  reason: string;
};

export type PriceReviewAutoRetroplayzoneResult = {
  ok: true;
  mode: "preview" | "apply";
  totalRetroplayzonePending: number;
  accepted: number;
  skipped: number;
  workerSynced: boolean;
  workerSyncError?: string;
  candidates: PriceReviewAutoRetroplayzoneCandidate[];
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
  const host = process.env.PRICE_WORKER_SFTP_HOST?.trim() || process.env.COVERS_FTP_HOST?.trim() || process.env.PRICE_WORKER_SSH_HOST?.trim();
  const username = process.env.PRICE_WORKER_SFTP_USER?.trim() || process.env.COVERS_FTP_USER?.trim() || process.env.PRICE_WORKER_SSH_USER?.trim();
  const password = process.env.PRICE_WORKER_SFTP_PASSWORD?.trim() || process.env.COVERS_FTP_PASSWORD?.trim() || process.env.PRICE_WORKER_SSH_PASSWORD?.trim();
  if (!host || !username || !password) return null;
  const portRaw = process.env.PRICE_WORKER_SFTP_PORT?.trim() || process.env.COVERS_FTP_PORT?.trim() || process.env.PRICE_WORKER_SSH_PORT?.trim();
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

function normalizedText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function hasAny(text: string, values: string[]): boolean {
  return values.some((value) => text.includes(value));
}

function titleSuggestsHardwareOrLot(title: string): boolean {
  const text = normalizedText(title);
  return hasAny(text, [
    " lote ",
    " pack ",
    " consola",
    " mando",
    " cable",
    " cargador",
    " adaptador",
    " carcasa",
    " figura",
    " amiibo",
    " box only",
    " solo caja",
    " solo manual",
  ]);
}

function retroplayzoneRegionFromTitle(title: string): string | null {
  const text = normalizedText(title);
  if (/\b(esp|espana|spanish|castellano)\b/.test(text)) return "PAL España";
  if (/\b(eur|europe|europa|pal)\b/.test(text)) return "PAL Europa";
  if (/\b(usa|ntsc u|ntsc-?u)\b/.test(text)) return "USA";
  if (/\b(japan|japon|jpn|ntsc j|ntsc-?j)\b/.test(text)) return "Japón";
  if (/\b(asia|asian)\b/.test(text)) return "Asia";
  return null;
}

function retroplayzoneConditionFromTitle(title: string): PriceReviewCondition | null {
  const text = normalizedText(title);
  if (hasAny(text, [" precintado", " sealed", " nuevo"])) return "sealed";
  if (hasAny(text, [" completo", " cib", " con caja", " caja y manual"])) return "complete";
  if (hasAny(text, [" juego y manual", " con manual", " manual incluido"])) return "game_manual";
  if (hasAny(text, [" cartucho", " cartridge", " solo cartucho", " disco", " solo disco", " cd "])) return "loose";
  return null;
}

function hasUsefulRegionEvidence(item: PriceReviewItem, inferredRegion: string | null): boolean {
  const evidence = item.evidence?.regionEvidence ?? [];
  if (evidence.some((value) => !/sin prueba|no proof/i.test(value))) return true;
  return Boolean(inferredRegion);
}

function isSafeRetroplayzoneAutoAccept(item: PriceReviewItem): PriceReviewAutoRetroplayzoneCandidate {
  const catalogId = item.catalogId || item.candidateCatalogId || null;
  const inferredRegion = item.detectedRegion || item.targetRegion || retroplayzoneRegionFromTitle(item.listingTitle);
  const inferredCondition = (item.condition && item.condition !== "unknown"
    ? item.condition
    : retroplayzoneConditionFromTitle(item.listingTitle)) as PriceReviewCondition | null;
  const score = Number(item.evidence?.matchScore ?? 0);
  const aiConfidence = Number(item.evidence?.aiConfidence ?? 0);
  const method = normalizedText(item.evidence?.matchMethod);
  const title = normalizedText(item.listingTitle);
  const platformSlug = normalizedText(item.platformSlug);
  const platformWords = normalizedText(item.platformSlug.replace(/-/g, " "));
  const platformClear = !item.platformSlug || title.includes(platformSlug) || title.includes(platformWords) || Boolean(catalogId?.startsWith(`${item.platformSlug}-`));
  const matchClear = score >= 0.78 || aiConfidence >= 0.9 || (score >= 0.5 && hasUsefulRegionEvidence(item, inferredRegion) && Boolean(inferredCondition));

  if (!catalogId) {
    return { id: item.id, listingTitle: item.listingTitle, catalogId, region: inferredRegion, condition: inferredCondition, priceEur: item.priceEur, decision: "skip", reason: "sin ficha destino" };
  }
  if (!Number.isFinite(Number(item.priceEur)) || Number(item.priceEur) <= 0) {
    return { id: item.id, listingTitle: item.listingTitle, catalogId, region: inferredRegion, condition: inferredCondition, priceEur: item.priceEur, decision: "skip", reason: "sin precio válido" };
  }
  if (titleSuggestsHardwareOrLot(item.listingTitle)) {
    return { id: item.id, listingTitle: item.listingTitle, catalogId, region: inferredRegion, condition: inferredCondition, priceEur: item.priceEur, decision: "skip", reason: "posible lote/accesorio/hardware" };
  }
  if (!platformClear) {
    return { id: item.id, listingTitle: item.listingTitle, catalogId, region: inferredRegion, condition: inferredCondition, priceEur: item.priceEur, decision: "skip", reason: "plataforma no clara" };
  }
  if (!hasUsefulRegionEvidence(item, inferredRegion)) {
    return { id: item.id, listingTitle: item.listingTitle, catalogId, region: inferredRegion, condition: inferredCondition, priceEur: item.priceEur, decision: "skip", reason: "región sin prueba" };
  }
  if (!inferredCondition || inferredCondition === "unknown") {
    return { id: item.id, listingTitle: item.listingTitle, catalogId, region: inferredRegion, condition: inferredCondition, priceEur: item.priceEur, decision: "skip", reason: "estado no claro" };
  }
  if (!matchClear) {
    return { id: item.id, listingTitle: item.listingTitle, catalogId, region: inferredRegion, condition: inferredCondition, priceEur: item.priceEur, decision: "skip", reason: `match insuficiente${method ? ` (${method})` : ""}` };
  }
  return { id: item.id, listingTitle: item.listingTitle, catalogId, region: inferredRegion, condition: inferredCondition, priceEur: item.priceEur, decision: "accept", reason: "región, estado y match claros" };
}

export async function autoReviewRetroplayzonePrices(
  input: PriceReviewAutoRetroplayzoneInput = {},
): Promise<PriceReviewAutoRetroplayzoneResult | { error: string }> {
  const queue = (await readQueueFromWorker()) ?? readQueueFromDisk();
  const retroItems = queue.items.filter((item) => item.status === "pending" && normalizedText(item.source).includes("retroplayzone"));
  const candidates = retroItems.map(isSafeRetroplayzoneAutoAccept);
  const acceptedCandidates = candidates.filter((candidate) => candidate.decision === "accept");

  if (!input.apply) {
    return {
      ok: true,
      mode: "preview",
      totalRetroplayzonePending: retroItems.length,
      accepted: acceptedCandidates.length,
      skipped: candidates.length - acceptedCandidates.length,
      workerSynced: false,
      candidates,
    };
  }

  const now = new Date().toISOString();
  const acceptedById = new Map(acceptedCandidates.map((candidate) => [candidate.id, candidate]));
  const errors: string[] = [];
  for (const item of retroItems) {
    const candidate = acceptedById.get(item.id);
    if (!candidate?.catalogId || !candidate.condition) continue;
    const patch = patchFromReview(item, {
      action: "accept",
      catalogId: candidate.catalogId,
      region: candidate.region ?? undefined,
      condition: candidate.condition,
      note: "Autoaceptado RetroPlayZone: región, estado y match claros.",
    });
    const result = await updatePublishedCatalogPrices(candidate.catalogId, patch);
    if ("error" in result) {
      errors.push(`${item.id}: ${result.error}`);
      acceptedById.delete(item.id);
    }
  }
  if (errors.length) return { error: `No se pudieron aplicar todos los precios: ${errors.slice(0, 3).join(" · ")}` };

  queue.items = queue.items.map((item) => {
    const candidate = acceptedById.get(item.id);
    if (!candidate) return item;
    return {
      ...item,
      status: "accepted",
      catalogId: candidate.catalogId,
      candidateCatalogId: candidate.catalogId,
      targetRegion: candidate.region ?? item.targetRegion ?? item.detectedRegion ?? null,
      condition: candidate.condition,
      decidedAt: now,
      updatedAt: now,
      decision: {
        action: "accept",
        catalogId: candidate.catalogId,
        region: candidate.region,
        condition: candidate.condition,
        note: "Autoaceptado RetroPlayZone: región, estado y match claros.",
      },
      evidence: {
        ...(item.evidence ?? {}),
        reviewNotes: [
          ...(item.evidence?.reviewNotes ?? []),
          "Autoaceptado RetroPlayZone: región, estado y match claros.",
        ],
      },
    };
  });
  queue.decisions = [
    ...[...acceptedById.values()].map((candidate) => ({
      id: candidate.id,
      at: now,
      action: "accept",
      catalogId: candidate.catalogId,
      region: candidate.region,
      condition: candidate.condition,
      note: "Autoaceptado RetroPlayZone: región, estado y match claros.",
    })),
    ...queue.decisions,
  ].slice(0, 1000);
  const write = await writeQueue(queue);
  return {
    ok: true,
    mode: "apply",
    totalRetroplayzonePending: retroItems.length,
    accepted: acceptedById.size,
    skipped: candidates.length - acceptedById.size,
    workerSynced: write.workerSynced,
    workerSyncError: write.error,
    candidates: candidates.map((candidate) => acceptedById.has(candidate.id) ? candidate : { ...candidate, decision: candidate.decision === "accept" ? "skip" : candidate.decision }),
  };
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

export async function mergePriceReviewCatalogGames(
  id: string,
  input: PriceReviewMergeCatalogInput,
): Promise<
  | {
      ok: true;
      item: PriceReviewItem;
      targetCatalogId: string;
      mergedCatalogIds: string[];
      url: string;
      workerSynced: boolean;
      merge: unknown;
    }
  | { error: string }
> {
  const queue = (await readQueueFromWorker()) ?? readQueueFromDisk();
  const index = queue.items.findIndex((item) => item.id === id);
  if (index < 0) return { error: "Pendiente no encontrado." };
  const item = queue.items[index];
  const catalogIds = [...new Set((input.catalogIds ?? []).map((value) => value.trim()).filter(Boolean))];
  if (catalogIds.length < 2) return { error: "Selecciona al menos dos fichas para fusionar." };

  const merge = await mergePublishedCatalogGames({ catalogIds });
  if ("error" in merge) return merge;

  const now = new Date().toISOString();
  const mergedSet = new Set(merge.mergedCatalogIds);
  const alternatives = (item.evidence?.matchAlternatives ?? [])
    .filter((alt) => !alt.catalogId || !mergedSet.has(alt.catalogId))
    .map((alt) => (alt.catalogId && alt.catalogId !== merge.targetCatalogId ? alt : { ...alt, catalogId: merge.targetCatalogId, score: 1 }));
  if (!alternatives.some((alt) => alt.catalogId === merge.targetCatalogId)) {
    alternatives.unshift({ catalogId: merge.targetCatalogId, title: item.listingTitle, region: item.targetRegion ?? undefined, score: 1 });
  }
  const nextItem: PriceReviewItem = {
    ...item,
    catalogId: merge.targetCatalogId,
    candidateCatalogId: merge.targetCatalogId,
    updatedAt: now,
    evidence: {
      ...(item.evidence ?? {}),
      matchAlternatives: alternatives,
      reviewNotes: [
        ...(item.evidence?.reviewNotes ?? []),
        `Fichas fusionadas en ${merge.targetCatalogId}: ${merge.mergedCatalogIds.join(", ")}`,
      ],
    },
  };
  queue.items[index] = nextItem;
  const write = await writeQueue(queue);
  return {
    ok: true,
    item: nextItem,
    targetCatalogId: merge.targetCatalogId,
    mergedCatalogIds: merge.mergedCatalogIds,
    url: merge.url,
    workerSynced: write.workerSynced,
    merge,
  };
}
