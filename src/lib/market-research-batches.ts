import { randomUUID } from "crypto";
import path from "path";
import { appDataFile } from "./app-data-dir";
import { assertDurableBlobConfigured, blobAuthConfigured } from "./blob-auth";
import { getCatalogByPlatformWithOverlay } from "./catalog-runtime-overlay";
import {
  mutateBlobJsonDocument,
  mutateDiskJsonDocument,
  readBlobJsonDocument,
  readDiskJsonDocument,
  type JsonMutation,
} from "./json-document-store";
import { collectMarketResearchForCatalog } from "./market-research-service";
import type {
  MarketCollectionMode,
  MarketResearchBatch,
  MarketResearchBatchTarget,
} from "./market-research-types";
import type { CatalogGame } from "./types";

const BATCH_PATH = "region-atlas/market-research/batches.json";
const MAX_BATCHES = 40;
const DEFAULT_MAX_BATCH_SIZE = 25;
const STALE_TARGET_MS = 15 * 60 * 1000;

type BatchDocument = {
  schemaVersion: 1;
  updatedAt: string;
  batches: MarketResearchBatch[];
};

function shouldUseBlobStorage(): boolean {
  assertDurableBlobConfigured();
  if (process.env.VERCEL) return blobAuthConfigured();
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

function emptyDocument(): BatchDocument {
  return { schemaVersion: 1, updatedAt: new Date(0).toISOString(), batches: [] };
}

function parseDocument(raw: string): BatchDocument {
  const parsed = JSON.parse(raw) as Partial<BatchDocument>;
  if (!parsed || typeof parsed !== "object") throw new Error("El documento de lotes no es válido.");
  return {
    schemaVersion: 1,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
    batches: Array.isArray(parsed.batches) ? parsed.batches : [],
  };
}

function blobOptions() {
  return {
    pathname: BATCH_PATH,
    empty: emptyDocument,
    parse: parseDocument,
    maximumSizeInBytes: 4 * 1024 * 1024,
    cacheControlMaxAge: 15,
  };
}

function diskOptions() {
  return {
    pathname: appDataFile(path.join("market-research", "batches.json")),
    empty: emptyDocument,
    parse: parseDocument,
  };
}

async function readDocument(): Promise<BatchDocument> {
  if (shouldUseBlobStorage()) return readBlobJsonDocument(blobOptions());
  return readDiskJsonDocument(diskOptions());
}

async function mutateDocument<R>(mutation: JsonMutation<BatchDocument, R>): Promise<R> {
  if (shouldUseBlobStorage()) return mutateBlobJsonDocument(blobOptions(), mutation);
  return mutateDiskJsonDocument(diskOptions(), mutation);
}

function maximumBatchSize(): number {
  const configured = Number(process.env.MARKET_RESEARCH_MAX_BATCH_SIZE ?? DEFAULT_MAX_BATCH_SIZE);
  return Number.isFinite(configured)
    ? Math.min(50, Math.max(1, Math.floor(configured)))
    : DEFAULT_MAX_BATCH_SIZE;
}

function hasPrice(game: CatalogGame): boolean {
  return Boolean(
    game.hasEsPrice ||
    game.recommendedPrice != null ||
    game.estimatedPriceLoose != null ||
    game.estimatedPriceGameManual != null ||
    game.estimatedPriceComplete != null ||
    game.estimatedPriceSealed != null
  );
}

function hasCover(game: CatalogGame): boolean {
  return Boolean(game.coverUrl?.trim());
}

function matchesMode(game: CatalogGame, mode: MarketCollectionMode): boolean {
  if (mode === "missing_price") return !hasPrice(game);
  if (mode === "missing_cover") return !hasCover(game);
  if (mode === "missing_any") return !hasPrice(game) || !hasCover(game);
  return true;
}

export function selectMarketResearchTargets(input: {
  games: CatalogGame[];
  mode: MarketCollectionMode;
  region?: string | null;
  limit: number;
}): CatalogGame[] {
  const limit = Math.min(maximumBatchSize(), Math.max(1, Math.floor(input.limit)));
  return input.games
    .filter((game) => !input.region || game.region === input.region)
    .filter((game) => matchesMode(game, input.mode))
    .sort((a, b) => {
      const aMissing = Number(!hasPrice(a)) + Number(!hasCover(a));
      const bMissing = Number(!hasPrice(b)) + Number(!hasCover(b));
      return bMissing - aMissing || a.title.localeCompare(b.title, "es") || a.region.localeCompare(b.region, "es");
    })
    .slice(0, limit);
}

function toTarget(game: CatalogGame): MarketResearchBatchTarget {
  return {
    catalogId: game.id,
    title: game.title,
    platformSlug: game.platformSlug,
    region: game.region,
    status: "pending",
    startedAt: null,
    completedAt: null,
    error: null,
    observations: 0,
    routed: 0,
    covers: 0,
  };
}

export async function listMarketResearchBatches(limit = 10): Promise<MarketResearchBatch[]> {
  const document = await readDocument();
  return [...document.batches]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, Math.min(40, Math.max(1, limit)));
}

export async function getMarketResearchBatch(batchId: string): Promise<MarketResearchBatch | null> {
  const document = await readDocument();
  return document.batches.find((batch) => batch.id === batchId) ?? null;
}

export async function createMarketResearchBatch(input: {
  platformSlug: string;
  region?: string | null;
  mode: MarketCollectionMode;
  limit: number;
  createdBy: string;
}): Promise<MarketResearchBatch | { error: string }> {
  const platformSlug = input.platformSlug.trim();
  if (!platformSlug) return { error: "Selecciona una plataforma." };
  const games = await getCatalogByPlatformWithOverlay(platformSlug);
  const selected = selectMarketResearchTargets({
    games,
    mode: input.mode,
    region: input.region?.trim() || null,
    limit: input.limit,
  });
  if (selected.length === 0) return { error: "No hay fichas que cumplan esos filtros." };

  const now = new Date().toISOString();
  const batch: MarketResearchBatch = {
    id: `market-batch-${randomUUID()}`,
    status: "ready",
    mode: input.mode,
    platformSlug,
    region: input.region?.trim() || null,
    limit: selected.length,
    createdAt: now,
    createdBy: input.createdBy,
    updatedAt: now,
    targets: selected.map(toTarget),
    log: [{ at: now, level: "info", message: `Lote creado con ${selected.length} ficha(s).` }],
  };

  return mutateDocument((current) => {
    const next = {
      schemaVersion: 1 as const,
      updatedAt: now,
      batches: [batch, ...current.batches.filter((item) => item.id !== batch.id)].slice(0, MAX_BATCHES),
    };
    return { next, result: batch };
  });
}

export async function setMarketResearchBatchStatus(
  batchId: string,
  action: "pause" | "resume" | "cancel",
): Promise<MarketResearchBatch | { error: string }> {
  return mutateDocument<MarketResearchBatch | { error: string }>((current) => {
    const batch = current.batches.find((item) => item.id === batchId);
    if (!batch) return { next: current, result: { error: "Lote no encontrado." }, changed: false };
    if (batch.status === "completed" || batch.status === "cancelled") {
      return { next: current, result: { error: "El lote ya está cerrado." }, changed: false };
    }
    const now = new Date().toISOString();
    const status = action === "pause" ? "paused" : action === "cancel" ? "cancelled" : "ready";
    const updated: MarketResearchBatch = {
      ...batch,
      status,
      updatedAt: now,
      log: [
        { at: now, level: "info" as const, message: action === "pause" ? "Lote pausado." : action === "cancel" ? "Lote cancelado." : "Lote reanudado." },
        ...batch.log,
      ].slice(0, 120),
    };
    const next = {
      ...current,
      updatedAt: now,
      batches: current.batches.map((item) => item.id === batchId ? updated : item),
    };
    return { next, result: updated };
  });
}

async function claimNextTarget(batchId: string): Promise<{
  batch: MarketResearchBatch;
  target: MarketResearchBatchTarget | null;
} | { error: string }> {
  return mutateDocument<{ batch: MarketResearchBatch; target: MarketResearchBatchTarget | null } | { error: string }>((current) => {
    const batch = current.batches.find((item) => item.id === batchId);
    if (!batch) return { next: current, result: { error: "Lote no encontrado." }, changed: false };
    if (batch.status === "paused" || batch.status === "cancelled" || batch.status === "completed") {
      return { next: current, result: { batch, target: null }, changed: false };
    }

    const now = new Date();
    const targets = batch.targets.map((target) => {
      const startedAt = Date.parse(target.startedAt ?? "");
      if (target.status === "running" && Number.isFinite(startedAt) && now.getTime() - startedAt > STALE_TARGET_MS) {
        return { ...target, status: "pending" as const, startedAt: null, error: "Reintentado tras quedar interrumpido." };
      }
      return target;
    });
    const targetIndex = targets.findIndex((target) => target.status === "pending");
    if (targetIndex < 0) {
      const hasRunning = targets.some((target) => target.status === "running");
      const updated = {
        ...batch,
        targets,
        status: hasRunning ? "running" as const : "completed" as const,
        updatedAt: now.toISOString(),
      };
      const next = {
        ...current,
        updatedAt: updated.updatedAt,
        batches: current.batches.map((item) => item.id === batchId ? updated : item),
      };
      return { next, result: { batch: updated, target: null } };
    }

    const claimed = { ...targets[targetIndex], status: "running" as const, startedAt: now.toISOString(), error: null };
    targets[targetIndex] = claimed;
    const updated: MarketResearchBatch = {
      ...batch,
      status: "running",
      updatedAt: now.toISOString(),
      targets,
      log: [
        { at: now.toISOString(), level: "info" as const, message: `Analizando ${claimed.title} (${claimed.region}).`, catalogId: claimed.catalogId },
        ...batch.log,
      ].slice(0, 120),
    };
    const next = {
      ...current,
      updatedAt: updated.updatedAt,
      batches: current.batches.map((item) => item.id === batchId ? updated : item),
    };
    return { next, result: { batch: updated, target: claimed } };
  });
}

async function finishTarget(input: {
  batchId: string;
  catalogId: string;
  result?: { observations: number; routed: number; covers: number };
  error?: string;
}): Promise<MarketResearchBatch | { error: string }> {
  return mutateDocument<MarketResearchBatch | { error: string }>((current) => {
    const batch = current.batches.find((item) => item.id === input.batchId);
    if (!batch) return { next: current, result: { error: "Lote no encontrado." }, changed: false };
    const now = new Date().toISOString();
    const targets = batch.targets.map((target) => target.catalogId === input.catalogId ? {
      ...target,
      status: input.error ? "failed" as const : "completed" as const,
      completedAt: now,
      error: input.error ?? null,
      observations: input.result?.observations ?? 0,
      routed: input.result?.routed ?? 0,
      covers: input.result?.covers ?? 0,
    } : target);
    const allFinished = targets.every((target) => target.status === "completed" || target.status === "failed");
    const updated: MarketResearchBatch = {
      ...batch,
      status: allFinished ? "completed" : batch.status === "paused" ? "paused" : "ready",
      updatedAt: now,
      targets,
      log: [
        {
          at: now,
          level: input.error ? "error" as const : "info" as const,
          message: input.error
            ? `Falló ${input.catalogId}: ${input.error}`
            : `${input.catalogId}: ${input.result?.observations ?? 0} anuncio(s), ${input.result?.routed ?? 0} en otras variantes y ${input.result?.covers ?? 0} portada(s).`,
          catalogId: input.catalogId,
        },
        ...batch.log,
      ].slice(0, 120),
    };
    const next = {
      ...current,
      updatedAt: now,
      batches: current.batches.map((item) => item.id === input.batchId ? updated : item),
    };
    return { next, result: updated };
  });
}

export async function processNextMarketResearchBatch(
  batchId: string,
  collectedBy: string,
): Promise<{ batch: MarketResearchBatch; processed: string | null } | { error: string }> {
  const claimed = await claimNextTarget(batchId);
  if ("error" in claimed) return claimed;
  if (!claimed.target) return { batch: claimed.batch, processed: null };

  try {
    const collected = await collectMarketResearchForCatalog(claimed.target.catalogId, collectedBy);
    if ("error" in collected) {
      const batch = await finishTarget({
        batchId,
        catalogId: claimed.target.catalogId,
        error: collected.error,
      });
      if ("error" in batch) return batch;
      return { batch, processed: claimed.target.catalogId };
    }
    const batch = await finishTarget({
      batchId,
      catalogId: claimed.target.catalogId,
      result: {
        observations: collected.observations,
        routed: collected.routed,
        covers: collected.coverCandidates,
      },
    });
    if ("error" in batch) return batch;
    return { batch, processed: claimed.target.catalogId };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 240) : "Error inesperado durante la recolección.";
    const batch = await finishTarget({ batchId, catalogId: claimed.target.catalogId, error: message });
    if ("error" in batch) return batch;
    return { batch, processed: claimed.target.catalogId };
  }
}
