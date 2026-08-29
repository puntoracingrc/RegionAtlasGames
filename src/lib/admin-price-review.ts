import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { appDataDir } from "./app-data-dir";
import { canWriteCatalogFiles } from "./admin-auth";
import { clonePublishedCatalogGameToRegion, mergePublishedCatalogGames, updatePublishedCatalogPrices } from "./admin-catalog-publish";
import { priceWorkerPublicBaseUrl } from "./admin-price-collect";
import { getCoverSrc } from "./cover-url";
import { todoConsolasListingMetadata } from "./todoconsolas-listing";
import type { CatalogGame } from "./types";
import catalogData from "../../data/catalog.json";

const REVIEW_FILE =
  process.env.ADMIN_PRICE_REVIEW_FILE ??
  (process.env.VERCEL
    ? path.join(appDataDir(), "price-review-queue.json")
    : path.join(process.cwd(), "data", "admin", "price-review-queue.json"));
const MAX_PRICE_REVIEW_DECISIONS = 5_000;

export type PriceReviewStatus = "pending" | "accepted" | "rejected";
export type PriceReviewCondition = "loose" | "game_manual" | "complete" | "sealed" | "unknown";
export type PriceReviewTriageBucket =
  | "safe_exact"
  | "manual_match"
  | "catalog_gap"
  | "regional_variant"
  | "price_anomaly"
  | "missing_region";
export type PriceReviewTriageFilter = PriceReviewTriageBucket | "actionable" | "all";
export type PriceReviewTriageCounts = Record<PriceReviewTriageFilter, number>;

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
  triageBucket?: PriceReviewTriageBucket | "resolved_exact" | "resolved_duplicate" | null;
  triageReason?: string | null;
  triageCatalogId?: string | null;
  triageMatchMethod?: string | null;
  triageMatchedReference?: string | null;
  evidence?: {
    url?: string | null;
    imageUrl?: string | null;
    imageUrls?: string[] | null;
    regionEvidence?: string[];
    matchMethod?: string | null;
    matchScore?: number | null;
    matchMargin?: number | null;
    matchAlternatives?: Array<{ catalogId?: string; title?: string; region?: string; coverUrl?: string | null; score?: number }>;
    aiConfidence?: number | null;
    reviewNotes?: string[];
    conditionRaw?: string | null;
    catalogTitle?: string | null;
    catalogCoverUrl?: string | null;
    imageCapturedAt?: string | null;
    imageSource?: string | null;
    coverVision?: Record<string, unknown> | null;
    searchedCatalogId?: string | null;
    originCountry?: string | null;
    originRegionHint?: string | null;
    routingReason?: string | null;
    displayTitle?: string | null;
    sourceRegionCode?: string | null;
    sourceRegionLabel?: string | null;
    gameKeyCard?: boolean | null;
    fullySpanishVersion?: boolean | null;
  };
  catalogPreview?: {
    id: string;
    title: string;
    region: string;
    edition: string;
    coverUrl: string | null;
  } | null;
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

const catalogPreviewById = new Map(
  (catalogData as CatalogGame[]).map((game) => [
    game.id,
    {
      id: game.id,
      title: game.title,
      region: game.region,
      edition: game.edition,
      coverUrl: getCoverSrc(game.coverUrl, game.id),
    },
  ]),
);

export function priceReviewCatalogPreview(item: PriceReviewItem): NonNullable<PriceReviewItem["catalogPreview"]> | null {
  const candidateIds = [
    item.candidateCatalogId,
    item.catalogId,
    item.triageCatalogId,
    item.evidence?.searchedCatalogId,
    ...(item.evidence?.matchAlternatives ?? []).map((candidate) => candidate.catalogId),
  ];
  for (const candidateId of candidateIds) {
    const clean = candidateId?.trim();
    if (!clean) continue;
    const preview = catalogPreviewById.get(clean);
    if (preview) return preview;
  }
  return null;
}

type PriceReviewQueue = {
  schemaVersion: number;
  updatedAt: string;
  items: PriceReviewItem[];
  decisions: Array<Record<string, unknown>>;
};

type CoverVisionResult = {
  isTargetGame: boolean;
  region: string | null;
  condition: PriceReviewCondition | null;
  confidence: number;
  evidence: string[];
  reason: string;
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
  platformSlug?: string;
  source?: string;
  query?: string;
  assumedRegion?: string;
  assumedCondition?: PriceReviewCondition | "none";
  useVision?: boolean;
  visionLimit?: number;
  triageBucket?: PriceReviewTriageFilter;
};

export type PriceReviewPcImageJobInput = Pick<
  PriceReviewAutoRetroplayzoneInput,
  "platformSlug" | "source" | "query" | "triageBucket"
> & {
  mediaLimit?: number;
};

export type PriceReviewTriageView = {
  items: PriceReviewItem[];
  counts: PriceReviewTriageCounts;
  total: number;
  filter: PriceReviewTriageFilter;
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
  label: string;
  totalPending: number;
  totalRetroplayzonePending: number;
  accepted: number;
  skipped: number;
  workerSynced: boolean;
  workerSyncError?: string;
  candidates: PriceReviewAutoRetroplayzoneCandidate[];
};

export type PriceReviewPcVisionJobResult = {
  ok: true;
  jobId: string;
  message: string;
};

function emptyQueue(): PriceReviewQueue {
  return { schemaVersion: 1, updatedAt: new Date().toISOString(), items: [], decisions: [] };
}

export function normalizeTodoConsolasReviewItem(item: PriceReviewItem): PriceReviewItem {
  if (item.source.toLowerCase() !== "todoconsolas") return item;
  const metadata = todoConsolasListingMetadata(item.listingTitle, item.platformSlug);
  const evidence = item.evidence ?? {};
  const sourceRegionCode = evidence.sourceRegionCode?.trim() || metadata.sourceRegionCode;
  const regionEvidence = [...(evidence.regionEvidence ?? [])];
  if (sourceRegionCode) {
    const suffixEvidence = `tcns_suffix_${sourceRegionCode.toLowerCase()}`;
    if (!regionEvidence.includes(suffixEvidence)) regionEvidence.unshift(suffixEvidence);
  }
  return {
    ...item,
    detectedRegion: item.detectedRegion || metadata.detectedRegion,
    evidence: {
      ...evidence,
      displayTitle: evidence.displayTitle?.trim() || metadata.displayTitle,
      sourceRegionCode,
      sourceRegionLabel: evidence.sourceRegionLabel?.trim() || metadata.sourceRegionLabel,
      gameKeyCard: evidence.gameKeyCard ?? metadata.gameKeyCard,
      fullySpanishVersion: evidence.fullySpanishVersion ?? metadata.fullySpanishVersion,
      regionEvidence,
    },
  };
}

function normalizeQueue(input: unknown): PriceReviewQueue {
  const raw = input && typeof input === "object" ? (input as Partial<PriceReviewQueue>) : {};
  const items = Array.isArray(raw.items)
    ? raw.items
      .filter((item): item is PriceReviewItem => Boolean(item?.id && item?.listingTitle))
      .map(normalizeTodoConsolasReviewItem)
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

async function writeWorkerFile(remote: string, payload: Buffer): Promise<{ ok: true } | { error: string }> {
  const config = workerSftpConfig();
  if (!config) return { error: "SFTP del worker no configurado." };
  const mod = (await import("ssh2-sftp-client")) as unknown as {
    default: new () => {
      connect(config: Record<string, unknown>): Promise<void>;
      mkdir(remotePath: string, recursive?: boolean): Promise<void>;
      put(input: Buffer | string, remotePath: string): Promise<void>;
      end(): Promise<void>;
    };
  };
  const client = new mod.default();
  const remotePath = path.posix.join(priceWorkerRemoteRoot(), remote);
  try {
    await client.connect({ ...config, readyTimeout: 60_000, retries: 1 });
    await client.mkdir(path.posix.dirname(remotePath), true);
    await client.put(payload, remotePath);
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo escribir en el worker por SFTP." };
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function startPriceReviewPcVisionJob(
  input: PriceReviewAutoRetroplayzoneInput = {},
): Promise<PriceReviewPcVisionJobResult | { error: string }> {
  const jobId = `review-vision-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const visionLimit = normalizeVisionLimit({ ...input, visionLimit: input.visionLimit ?? 25 });
  const request = {
    jobId,
    jobType: "price_review_vision",
    platformSlug: input.platformSlug,
    source: input.source,
    query: input.query,
    assumedRegion: input.assumedRegion,
    assumedCondition: input.assumedCondition ?? "none",
    triageBucket: input.triageBucket ?? "all",
    visionLimit,
    requestedAt: now,
    runner: "pc_sftp_worker",
  };
  const status = {
    jobId,
    jobType: "price_review_vision",
    status: "pending",
    platformSlug: input.platformSlug,
    source: input.source,
    query: input.query,
    visionLimit,
    startedAt: now,
    updatedAt: now,
    logTail: "Job de IA de portadas enviado al PC worker por SFTP.",
  };
  const statusWritten = await writeWorkerFile(`jobs/review-${jobId}.json`, Buffer.from(`${JSON.stringify(status, null, 2)}\n`, "utf8"));
  if ("error" in statusWritten) return statusWritten;
  const requestWritten = await writeWorkerFile(`jobs/review-requests/${jobId}.json`, Buffer.from(`${JSON.stringify(request, null, 2)}\n`, "utf8"));
  if ("error" in requestWritten) return requestWritten;
  return { ok: true, jobId, message: "Job de IA de portadas enviado al PC. Refresca estado cuando termine." };
}

export async function startPriceReviewPcImageJob(
  input: PriceReviewPcImageJobInput = {},
): Promise<PriceReviewPcVisionJobResult | { error: string }> {
  const jobId = `review-images-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const rawLimit = Number(input.mediaLimit ?? 1_000);
  const mediaLimit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(2_000, Math.round(rawLimit)))
    : 1_000;
  const request = {
    jobId,
    jobType: "price_review_images",
    captureOnly: true,
    platformSlug: input.platformSlug,
    source: input.source,
    query: input.query,
    triageBucket: input.triageBucket ?? "all",
    mediaLimit,
    captureDelaySeconds: 8,
    requestedAt: now,
    runner: "pc_sftp_worker",
  };
  const status = {
    jobId,
    jobType: "price_review_images",
    status: "pending",
    platformSlug: input.platformSlug,
    source: input.source,
    query: input.query,
    triageBucket: input.triageBucket ?? "all",
    mediaLimit,
    startedAt: now,
    updatedAt: now,
    logTail: "Captura prudente de portadas enviada al PC worker por SFTP.",
  };
  const statusWritten = await writeWorkerFile(
    `jobs/review-${jobId}.json`,
    Buffer.from(`${JSON.stringify(status, null, 2)}\n`, "utf8"),
  );
  if ("error" in statusWritten) return statusWritten;
  const requestWritten = await writeWorkerFile(
    `jobs/review-requests/${jobId}.json`,
    Buffer.from(`${JSON.stringify(request, null, 2)}\n`, "utf8"),
  );
  if ("error" in requestWritten) return requestWritten;
  return {
    ok: true,
    jobId,
    message: "Captura de portadas enviada al PC. La cola se actualizará sin aprobar precios.",
  };
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

const TRIAGE_BUCKETS: PriceReviewTriageBucket[] = [
  "safe_exact",
  "manual_match",
  "catalog_gap",
  "regional_variant",
  "price_anomaly",
  "missing_region",
];

function emptyTriageCounts(): PriceReviewTriageCounts {
  return {
    all: 0,
    actionable: 0,
    safe_exact: 0,
    manual_match: 0,
    catalog_gap: 0,
    regional_variant: 0,
    price_anomaly: 0,
    missing_region: 0,
  };
}

export function normalizePriceReviewTriageFilter(value: string | null | undefined): PriceReviewTriageFilter {
  if (value === "all" || value === "actionable" || TRIAGE_BUCKETS.includes(value as PriceReviewTriageBucket)) {
    return value as PriceReviewTriageFilter;
  }
  return "actionable";
}

export function priceReviewTriageBucket(item: PriceReviewItem): PriceReviewTriageBucket {
  if (TRIAGE_BUCKETS.includes(item.triageBucket as PriceReviewTriageBucket)) {
    return item.triageBucket as PriceReviewTriageBucket;
  }
  if (item.source.toLowerCase() !== "todoconsolas") return "manual_match";
  if (["price_out_of_range", "price_change_requires_review"].includes(item.reason)) return "price_anomaly";
  if (item.reason === "catalog_region_not_exact") return "regional_variant";
  if (item.reason === "listing_region_missing") return "missing_region";
  if (!item.catalogId && !item.candidateCatalogId && !(item.evidence?.matchAlternatives?.length)) {
    return "catalog_gap";
  }
  return "manual_match";
}

export function priceReviewMatchesTriageFilter(
  item: PriceReviewItem,
  filter: PriceReviewTriageFilter,
): boolean {
  if (filter === "all") return true;
  const bucket = priceReviewTriageBucket(item);
  if (filter === "actionable") return bucket === "manual_match" || bucket === "missing_region";
  return bucket === filter;
}

export async function getPriceReviewTriageView(
  limit = 200,
  requestedFilter: PriceReviewTriageFilter = "actionable",
): Promise<PriceReviewTriageView> {
  const queue = (await readQueueFromWorker()) ?? readQueueFromDisk();
  const filter = normalizePriceReviewTriageFilter(requestedFilter);
  const counts = emptyTriageCounts();
  const pending = queue.items
    .filter((item) => item.status === "pending")
    .map((item) => {
      const triageBucket = priceReviewTriageBucket(item);
      counts.all += 1;
      counts[triageBucket] += 1;
      if (triageBucket === "manual_match" || triageBucket === "missing_region") counts.actionable += 1;
      return {
        ...item,
        triageBucket,
        catalogPreview: priceReviewCatalogPreview(item),
      };
    })
    .sort((a, b) => Date.parse(b.updatedAt ?? b.createdAt ?? "") - Date.parse(a.updatedAt ?? a.createdAt ?? ""));
  const items = pending.filter((item) => priceReviewMatchesTriageFilter(item, filter)).slice(0, limit);
  return { items, counts, total: counts.all, filter };
}

export async function listPriceReviewItems(limit = 40): Promise<PriceReviewItem[]> {
  return (await getPriceReviewTriageView(limit, "all")).items;
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

function regionFromTitle(title: string): string | null {
  const text = normalizedText(title);
  if (/\b(esp|espana|spanish|castellano)\b/.test(text)) return "PAL España";
  if (/\b(eur|europe|europa|pal)\b/.test(text)) return "PAL Europa";
  if (/\b(usa|ntsc u|ntsc-?u)\b/.test(text)) return "USA";
  if (/\b(japan|japon|jpn|ntsc j|ntsc-?j)\b/.test(text)) return "Japón";
  if (/\b(asia|asian)\b/.test(text)) return "Asia";
  return null;
}

function conditionFromTitle(title: string): PriceReviewCondition | null {
  const text = normalizedText(title);
  if (hasAny(text, [" precintado", " sealed", " nuevo"])) return "sealed";
  if (hasAny(text, [" completo", " cib", " con caja", " caja y manual"])) return "complete";
  if (hasAny(text, [" juego y manual", " con manual", " manual incluido"])) return "game_manual";
  if (hasAny(text, [" cartucho", " cartridge", " solo cartucho", " disco", " solo disco", " cd "])) return "loose";
  return null;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const direct = text.trim();
  for (const candidate of [direct, direct.match(/\{[\s\S]*\}/)?.[0] ?? ""]) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate) as unknown;
      return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
    } catch {
      // try next candidate
    }
  }
  return null;
}

function clampScore(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1, num));
}

function mapVisionRegion(value: unknown): string | null {
  const text = normalizedText(String(value ?? ""));
  if (!text || text === "unknown") return null;
  if (text.includes("espana") || text.includes("spain") || text.includes("spanish")) return "PAL España";
  if (text.includes("pal") || text.includes("euro") || text.includes("pegi")) return "PAL Europa";
  if (text.includes("usa") || text.includes("esrb") || text.includes("ntsc u")) return "USA";
  if (text.includes("japon") || text.includes("japan") || text.includes("ntsc j")) return "Japón";
  if (text.includes("asia")) return "Asia";
  return null;
}

function mapVisionCondition(value: unknown): PriceReviewCondition | null {
  const text = normalizedText(String(value ?? ""));
  if (!text || text === "null" || text === "unknown") return null;
  if (text.includes("sealed") || text.includes("precint")) return "sealed";
  if (text.includes("game_manual") || text.includes("manual")) return "game_manual";
  if (text.includes("complete") || text.includes("completo") || text.includes("case") || text.includes("caja")) return "complete";
  if (text.includes("loose") || text.includes("suelto") || text.includes("cartucho") || text.includes("disco")) return "loose";
  return null;
}

function reviewImageUrls(item: PriceReviewItem): string[] {
  return [...new Set([
    item.evidence?.imageUrl,
    ...(item.evidence?.imageUrls ?? []),
  ].map((url) => url?.trim()).filter((url): url is string => Boolean(url)))]
    .filter((url) => /^https?:\/\//i.test(url))
    .slice(0, 2);
}

function isUsefulListingPageUrl(pageUrl: string | null | undefined): boolean {
  const clean = pageUrl?.trim();
  if (!clean || !/^https?:\/\//i.test(clean)) return false;
  try {
    const url = new URL(clean);
    const path = url.pathname.replace(/\/+$/g, "");
    return path.length > 0 && path !== "/";
  } catch {
    return false;
  }
}

function hasReviewImageSource(item: PriceReviewItem): boolean {
  return reviewImageUrls(item).length > 0 || isUsefulListingPageUrl(item.evidence?.url);
}

function absoluteImageUrl(rawUrl: string, pageUrl: string): string | null {
  const clean = rawUrl.trim().replace(/&amp;/g, "&");
  if (!clean || clean.startsWith("data:")) return null;
  try {
    return new URL(clean, pageUrl).toString();
  } catch {
    return null;
  }
}

function imageUrlLooksUseful(url: string): boolean {
  const text = normalizedText(url);
  if (!/^https?:\/\//i.test(url)) return false;
  if (/\.(svg|ico)(\?|$)/i.test(url)) return false;
  return !hasAny(text, ["logo", "sprite", "placeholder", "favicon", "payment", "banner", "icon"]);
}

function pushImageCandidate(out: string[], value: string | undefined, pageUrl: string): void {
  if (!value) return;
  const firstSrcSetUrl = value.split(",")[0]?.trim().split(/\s+/)[0] ?? value;
  const imageUrl = absoluteImageUrl(firstSrcSetUrl, pageUrl);
  if (!imageUrl || !imageUrlLooksUseful(imageUrl) || out.includes(imageUrl)) return;
  out.push(imageUrl);
}

function extractImageUrlsFromHtml(html: string, pageUrl: string): string[] {
  const out: string[] = [];
  const metaRegex = /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image|image)["'][^>]+content=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(metaRegex)) pushImageCandidate(out, match[1], pageUrl);

  const imageJsonRegex = /"image"\s*:\s*(?:"([^"]+)"|\[\s*"([^"]+)")/gi;
  for (const match of html.matchAll(imageJsonRegex)) pushImageCandidate(out, match[1] ?? match[2], pageUrl);

  const imgRegex = /<img\b[^>]+>/gi;
  for (const tagMatch of html.matchAll(imgRegex)) {
    const tag = tagMatch[0];
    const attr = tag.match(/\b(?:data-full-size-image-url|data-src|src|srcset)=["']([^"']+)["']/i)?.[1];
    pushImageCandidate(out, attr, pageUrl);
    if (out.length >= 3) break;
  }

  return out.slice(0, 2);
}

async function fetchListingImageUrls(item: PriceReviewItem): Promise<string[]> {
  const pageUrl = item.evidence?.url?.trim();
  if (!pageUrl || !isUsefulListingPageUrl(pageUrl)) return [];
  try {
    const response = await fetch(pageUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "RegionAtlasGamesBot/1.0 (+https://www.regionatlas.games)",
      },
    });
    if (!response.ok) return [];
    const html = await response.text();
    return extractImageUrlsFromHtml(html.slice(0, 500_000), pageUrl);
  } catch {
    return [];
  }
}

function regionsCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return true;
  if (a === b) return true;
  const pair = new Set([a, b]);
  return pair.has("PAL España") && pair.has("PAL Europa");
}

async function analyzeReviewCoverVision(item: PriceReviewItem): Promise<CoverVisionResult | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const images = reviewImageUrls(item);
  if (!images.length) images.push(...await fetchListingImageUrls(item));
  if (!images.length) return null;

  const content = [
    {
      type: "input_text",
      text:
        "Analiza la portada/foto de un videojuego físico para revisar precio en Region Atlas. " +
        "Accede a la URL de imagen y mira señales visibles: PEGI, ESRB, NTSC, textos en español, japonés, caja, manual o disco/cartucho. " +
        "Responde SOLO JSON válido con estas claves: " +
        '{"isTargetGame":boolean,"listingRegion":"PAL Europa|PAL España|USA|Japón|Asia|unknown",' +
        '"condition":"loose|game_manual|complete|sealed|null","confidence":0-1,' +
        '"evidence":["cover_pal_eu"|"cover_spain"|"cover_usa"|"cover_japan"|"photo_region_mark"],"reason":"texto breve"}. ' +
        `Juego candidato: ${item.catalogId || item.candidateCatalogId || "sin ficha"}. ` +
        `Título anuncio: ${item.listingTitle}. Plataforma: ${item.platformSlug}. ` +
        "Reglas: PEGI indica PAL Europa; PEGI con textos claramente españoles puede ser PAL España; ESRB/NTSC-U indica USA; kanji/kana o CERO/JPN indica Japón. " +
        "isTargetGame=false si la portada no parece corresponder al título/plataforma.",
    },
    ...images.map((imageUrl) => ({ type: "input_image", image_url: imageUrl })),
  ];

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o-mini",
        input: [{ role: "user", content }],
        max_output_tokens: 450,
      }),
    });
    if (!response.ok) return null;
    const data = await response.json() as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
    };
    const text = data.output_text
      ?? data.output?.flatMap((entry) => entry.content ?? []).map((entry) => entry.text ?? "").join("\n")
      ?? "";
    const parsed = extractJsonObject(text);
    if (!parsed) return null;
    const evidence = Array.isArray(parsed.evidence)
      ? parsed.evidence.map(String).filter(Boolean).slice(0, 6)
      : [];
    const region = mapVisionRegion(parsed.listingRegion);
    return {
      isTargetGame: parsed.isTargetGame === true,
      region,
      condition: mapVisionCondition(parsed.condition),
      confidence: clampScore(parsed.confidence),
      evidence: evidence.length ? evidence : region ? ["photo_region_mark"] : [],
      reason: String(parsed.reason ?? "").slice(0, 240),
    };
  } catch {
    return null;
  }
}

function hasUsefulRegionEvidence(item: PriceReviewItem, inferredRegion: string | null): boolean {
  const evidence = item.evidence?.regionEvidence ?? [];
  if (evidence.some((value) => !/sin prueba|no proof/i.test(value))) return true;
  return Boolean(inferredRegion);
}

function isSafeAutoAccept(
  item: PriceReviewItem,
  input: PriceReviewAutoRetroplayzoneInput,
  vision: CoverVisionResult | null = null,
  visionUnavailableReason?: string,
): PriceReviewAutoRetroplayzoneCandidate {
  const catalogId = item.catalogId || item.candidateCatalogId || null;
  const assumedRegion = input.assumedRegion?.trim();
  const assumedCondition = input.assumedCondition && input.assumedCondition !== "none" ? input.assumedCondition : null;
  const titleRegion = regionFromTitle(item.listingTitle);
  const visionRegion = vision?.isTargetGame && vision.confidence >= 0.65 ? vision.region : null;
  const inferredRegion = item.detectedRegion || item.targetRegion || assumedRegion || visionRegion || titleRegion;
  const existingCondition = item.condition && item.condition !== "unknown" ? item.condition : null;
  const inferredCondition = (existingCondition || assumedCondition || vision?.condition || conditionFromTitle(item.listingTitle)) as PriceReviewCondition | null;
  const score = Number(item.evidence?.matchScore ?? 0);
  const aiConfidence = Number(item.evidence?.aiConfidence ?? 0);
  const method = normalizedText(item.evidence?.matchMethod);
  const title = normalizedText(item.listingTitle);
  const platformSlug = normalizedText(item.platformSlug);
  const platformWords = normalizedText(item.platformSlug.replace(/-/g, " "));
  const platformClear = !item.platformSlug || title.includes(platformSlug) || title.includes(platformWords) || Boolean(catalogId?.startsWith(`${item.platformSlug}-`));
  const hasRegionProof = hasUsefulRegionEvidence(item, inferredRegion) || Boolean(visionRegion);
  const matchClear = score >= 0.78 || aiConfidence >= 0.9 || (vision?.isTargetGame && vision.confidence >= 0.75) || (score >= 0.5 && hasRegionProof && Boolean(inferredCondition));

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
  if (input.useVision && !vision && visionUnavailableReason) {
    return { id: item.id, listingTitle: item.listingTitle, catalogId, region: inferredRegion, condition: inferredCondition, priceEur: item.priceEur, decision: "skip", reason: visionUnavailableReason };
  }
  if (vision && vision.confidence >= 0.7 && !vision.isTargetGame) {
    return { id: item.id, listingTitle: item.listingTitle, catalogId, region: inferredRegion, condition: inferredCondition, priceEur: item.priceEur, decision: "skip", reason: `visión portada: no parece el juego (${vision.reason || "sin detalle"})` };
  }
  if (visionRegion && inferredRegion && !regionsCompatible(visionRegion, inferredRegion)) {
    return { id: item.id, listingTitle: item.listingTitle, catalogId, region: inferredRegion, condition: inferredCondition, priceEur: item.priceEur, decision: "skip", reason: `visión portada incompatible (${visionRegion})` };
  }
  if (assumedRegion && titleRegion && !regionsCompatible(titleRegion, assumedRegion)) {
    return { id: item.id, listingTitle: item.listingTitle, catalogId, region: inferredRegion, condition: inferredCondition, priceEur: item.priceEur, decision: "skip", reason: `señal de región incompatible (${titleRegion})` };
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
  const reason = visionRegion
    ? `región, estado y match claros · visión portada ${visionRegion}${vision?.reason ? ` (${vision.reason})` : ""}`
    : "región, estado y match claros";
  return { id: item.id, listingTitle: item.listingTitle, catalogId, region: inferredRegion, condition: inferredCondition, priceEur: item.priceEur, decision: "accept", reason };
}

function itemMatchesAutoReviewInput(item: PriceReviewItem, input: PriceReviewAutoRetroplayzoneInput): boolean {
  if (item.status !== "pending") return false;
  const triageFilter = input.triageBucket ? normalizePriceReviewTriageFilter(input.triageBucket) : "all";
  if (!priceReviewMatchesTriageFilter(item, triageFilter)) return false;
  const platformSlug = input.platformSlug?.trim();
  if (platformSlug && platformSlug !== "all" && item.platformSlug !== platformSlug) return false;
  const source = input.source?.trim();
  if (source && source !== "all" && item.source !== source) return false;
  const query = normalizedText(input.query);
  if (!query) return true;
  return normalizedText([
    item.listingTitle,
    item.catalogId,
    item.candidateCatalogId,
    item.targetRegion,
    item.detectedRegion,
    item.reason,
    item.source,
    item.platformSlug,
  ].filter(Boolean).join(" ")).includes(query);
}

function autoReviewLabel(input: PriceReviewAutoRetroplayzoneInput): string {
  const visionLimit = normalizeVisionLimit(input);
  const parts = [
    input.platformSlug && input.platformSlug !== "all" ? input.platformSlug.toUpperCase() : null,
    input.source && input.source !== "all" ? input.source : null,
    input.query?.trim() ? `busqueda "${input.query.trim()}"` : null,
    input.assumedRegion?.trim() ? `region ${input.assumedRegion.trim()}` : null,
    input.assumedCondition && input.assumedCondition !== "none" ? `estado ${input.assumedCondition}` : null,
    input.useVision ? `IA portadas max ${visionLimit}` : null,
    input.triageBucket && input.triageBucket !== "all" ? `bandeja ${input.triageBucket}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "toda la cola";
}

function normalizeVisionLimit(input: PriceReviewAutoRetroplayzoneInput): number {
  const raw = Number(input.visionLimit ?? 10);
  if (!Number.isFinite(raw)) return 10;
  return Math.max(1, Math.min(25, Math.round(raw)));
}

async function buildAutoReviewCandidates(
  items: PriceReviewItem[],
  input: PriceReviewAutoRetroplayzoneInput,
): Promise<PriceReviewAutoRetroplayzoneCandidate[]> {
  if (!input.useVision) return items.map((item) => isSafeAutoAccept(item, input));
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return items.map((item) => isSafeAutoAccept(item, input, null, "IA de portadas no configurada"));
  }

  const candidates: PriceReviewAutoRetroplayzoneCandidate[] = [];
  const visionLimit = normalizeVisionLimit(input);
  let visionAttempts = 0;

  for (const item of items) {
    let vision: CoverVisionResult | null = null;
    let visionUnavailableReason: string | undefined;
    if (!hasReviewImageSource(item)) {
      visionUnavailableReason = "sin URL de portada o ficha para IA";
    } else if (visionAttempts >= visionLimit) {
      visionUnavailableReason = `fuera del límite IA (${visionLimit})`;
    } else {
      visionAttempts += 1;
      vision = await analyzeReviewCoverVision(item);
      if (!vision) visionUnavailableReason = "IA de portada sin resultado";
    }
    candidates.push(isSafeAutoAccept(item, input, vision, visionUnavailableReason));
  }

  return candidates;
}

export async function autoReviewRetroplayzonePrices(
  input: PriceReviewAutoRetroplayzoneInput = {},
): Promise<PriceReviewAutoRetroplayzoneResult | { error: string }> {
  const queue = (await readQueueFromWorker()) ?? readQueueFromDisk();
  const targetItems = queue.items.filter((item) => itemMatchesAutoReviewInput(item, input));
  const candidates = await buildAutoReviewCandidates(targetItems, input);
  const acceptedCandidates = candidates.filter((candidate) => candidate.decision === "accept");
  const label = autoReviewLabel(input);

  if (!input.apply) {
    return {
      ok: true,
      mode: "preview",
      label,
      totalPending: targetItems.length,
      totalRetroplayzonePending: targetItems.length,
      accepted: acceptedCandidates.length,
      skipped: candidates.length - acceptedCandidates.length,
      workerSynced: false,
      candidates,
    };
  }

  const now = new Date().toISOString();
  const acceptedById = new Map(acceptedCandidates.map((candidate) => [candidate.id, candidate]));
  const errors: string[] = [];
  for (const item of targetItems) {
    const candidate = acceptedById.get(item.id);
    if (!candidate?.catalogId || !candidate.condition) continue;
    const patch = patchFromReview(item, {
      action: "accept",
      catalogId: candidate.catalogId,
      region: candidate.region ?? undefined,
      condition: candidate.condition,
      note: `Autoaceptado cola de precios (${label}): región, estado y match claros.`,
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
        note: `Autoaceptado cola de precios (${label}): región, estado y match claros.`,
      },
      evidence: {
        ...(item.evidence ?? {}),
        reviewNotes: [
          ...(item.evidence?.reviewNotes ?? []),
          `Autoaceptado cola de precios (${label}): región, estado y match claros.`,
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
      note: `Autoaceptado cola de precios (${label}): región, estado y match claros.`,
    })),
    ...queue.decisions,
  ].slice(0, MAX_PRICE_REVIEW_DECISIONS);
  const write = await writeQueue(queue);
  return {
    ok: true,
    mode: "apply",
    label,
    totalPending: targetItems.length,
    totalRetroplayzonePending: targetItems.length,
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
  ].slice(0, MAX_PRICE_REVIEW_DECISIONS);
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
