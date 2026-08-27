import { createHash } from "crypto";
import path from "path";
import { appDataFile } from "./app-data-dir";
import { assertDurableBlobConfigured, blobAuthConfigured } from "./blob-auth";
import {
  mutateBlobJsonDocument,
  mutateDiskJsonDocument,
  readBlobJsonDocument,
  readDiskJsonDocument,
  type JsonMutation,
} from "./json-document-store";
import type {
  MarketObservation,
  MarketObservationReviewStatus,
  MarketResearchCatalogView,
  MarketResearchEstimate,
  MarketResearchPublication,
  MarketResearchRun,
  StoredCoverCandidate,
} from "./market-research-types";

const DEFAULT_RECENT_DAYS = 45;
const MAX_OBSERVATIONS_PER_GAME = 500;
const MAX_COVERS_PER_GAME = 80;
const MAX_RUNS_PER_GAME = 30;
const MAX_PUBLICATIONS_PER_GAME = 50;

type CatalogIdentity = {
  catalogId: string;
  title: string;
  platformSlug: string;
  region: string;
};

type MarketResearchCatalogDocument = CatalogIdentity & {
  schemaVersion: 1;
  updatedAt: string;
  lastCollectedAt: string | null;
  observations: MarketObservation[];
  coverCandidates: StoredCoverCandidate[];
  runs: MarketResearchRun[];
  publications: MarketResearchPublication[];
};

type CatalogMutation<R> = JsonMutation<MarketResearchCatalogDocument, R>;

function shouldUseBlobStorage(): boolean {
  assertDurableBlobConfigured();
  if (process.env.VERCEL) return blobAuthConfigured();
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

function storageKey(catalogId: string): string {
  return createHash("sha256").update(catalogId).digest("hex").slice(0, 32);
}

function emptyDocument(identity: CatalogIdentity): MarketResearchCatalogDocument {
  return {
    schemaVersion: 1,
    ...identity,
    updatedAt: new Date(0).toISOString(),
    lastCollectedAt: null,
    observations: [],
    coverCandidates: [],
    runs: [],
    publications: [],
  };
}

function parseDocument(raw: string, identity: CatalogIdentity): MarketResearchCatalogDocument {
  const parsed = JSON.parse(raw) as Partial<MarketResearchCatalogDocument>;
  if (!parsed || typeof parsed !== "object" || parsed.catalogId !== identity.catalogId) {
    throw new Error("El historial de mercado no corresponde a la ficha solicitada.");
  }
  return {
    ...emptyDocument(identity),
    ...parsed,
    schemaVersion: 1,
    catalogId: identity.catalogId,
    title: typeof parsed.title === "string" ? parsed.title : identity.title,
    platformSlug: typeof parsed.platformSlug === "string" ? parsed.platformSlug : identity.platformSlug,
    region: typeof parsed.region === "string" ? parsed.region : identity.region,
    observations: Array.isArray(parsed.observations) ? parsed.observations : [],
    coverCandidates: Array.isArray(parsed.coverCandidates) ? parsed.coverCandidates : [],
    runs: Array.isArray(parsed.runs) ? parsed.runs : [],
    publications: Array.isArray(parsed.publications) ? parsed.publications : [],
  };
}

function blobOptions(identity: CatalogIdentity) {
  return {
    pathname: `region-atlas/market-research/catalog/${storageKey(identity.catalogId)}.json`,
    empty: () => emptyDocument(identity),
    parse: (raw: string) => parseDocument(raw, identity),
    maximumSizeInBytes: 8 * 1024 * 1024,
    cacheControlMaxAge: 15,
  };
}

function diskOptions(identity: CatalogIdentity) {
  const filename = `${storageKey(identity.catalogId)}.json`;
  return {
    pathname: appDataFile(path.join("market-research", "catalog", filename)),
    empty: () => emptyDocument(identity),
    parse: (raw: string) => parseDocument(raw, identity),
  };
}

async function readDocument(identity: CatalogIdentity): Promise<MarketResearchCatalogDocument> {
  if (shouldUseBlobStorage()) return readBlobJsonDocument(blobOptions(identity));
  return readDiskJsonDocument(diskOptions(identity));
}

async function mutateDocument<R>(identity: CatalogIdentity, mutation: CatalogMutation<R>): Promise<R> {
  if (shouldUseBlobStorage()) return mutateBlobJsonDocument(blobOptions(identity), mutation);
  return mutateDiskJsonDocument(diskOptions(identity), mutation);
}

function parsedTime(value: string | null | undefined): number {
  const time = Date.parse(value ?? "");
  return Number.isFinite(time) ? time : 0;
}

function recentDays(): number {
  const configured = Number(process.env.MARKET_RESEARCH_RECENT_DAYS ?? DEFAULT_RECENT_DAYS);
  return Number.isFinite(configured) ? Math.min(120, Math.max(7, Math.floor(configured))) : DEFAULT_RECENT_DAYS;
}

export function isCurrentMarketObservation(observation: MarketObservation, now = Date.now()): boolean {
  const cutoff = now - recentDays() * 24 * 60 * 60 * 1000;
  if (parsedTime(observation.lastSeenAt) < cutoff) return false;
  const endAt = parsedTime(observation.itemEndDate);
  return endAt === 0 || endAt >= now;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  return Math.round(value * 100) / 100;
}

function withoutOutliers(values: number[]): { accepted: number[]; outliers: number } {
  const aboveFloor = values.filter((value) => Number.isFinite(value) && value >= 3);
  let outliers = values.length - aboveFloor.length;
  if (aboveFloor.length < 4) return { accepted: aboveFloor, outliers };

  const sorted = [...aboveFloor].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const lower = sorted.slice(0, middle);
  const upper = sorted.length % 2 === 0 ? sorted.slice(middle) : sorted.slice(middle + 1);
  const q1 = median(lower);
  const q3 = median(upper);
  const iqr = q3 - q1;
  const minimum = q1 - 1.5 * iqr;
  const maximum = q3 + 1.5 * iqr;
  const accepted = sorted.filter((value) => value >= minimum && value <= maximum);
  outliers += sorted.length - accepted.length;
  return { accepted, outliers };
}

export function calculateStoredMarketEstimates(
  observations: MarketObservation[],
  now = Date.now(),
): MarketResearchEstimate[] {
  const groups = new Map<string, {
    condition: Exclude<MarketObservation["conditionBucket"], "unknown">;
    currency: string;
    values: number[];
  }>();

  for (const observation of observations) {
    if (observation.reviewStatus !== "accepted" || !isCurrentMarketObservation(observation, now)) continue;
    if (observation.conditionBucket === "unknown" || observation.totalPrice == null || observation.totalPrice <= 0) continue;
    if (!observation.currency) continue;
    const key = `${observation.conditionBucket}:${observation.currency}`;
    const group = groups.get(key) ?? {
      condition: observation.conditionBucket,
      currency: observation.currency,
      values: [],
    };
    group.values.push(observation.totalPrice);
    groups.set(key, group);
  }

  return [...groups.values()].flatMap((group) => {
    const filtered = withoutOutliers(group.values);
    if (filtered.accepted.length === 0) return [];
    const observationsCount = filtered.accepted.length;
    return [{
      condition: group.condition,
      currency: group.currency,
      observations: observationsCount,
      activeObservations: group.values.length,
      outliers: filtered.outliers,
      minimum: Math.min(...filtered.accepted),
      median: median(filtered.accepted),
      maximum: Math.max(...filtered.accepted),
      verified: observationsCount >= 3,
      publishable: group.currency === "EUR" && observationsCount >= 3,
      label: observationsCount >= 3 ? "verified" as const : observationsCount >= 2 ? "estimated" as const : "indicative" as const,
    }];
  }).sort((a, b) => a.condition.localeCompare(b.condition) || a.currency.localeCompare(b.currency));
}

function toView(document: MarketResearchCatalogDocument): MarketResearchCatalogView {
  const now = Date.now();
  const observations = [...document.observations].sort((a, b) => parsedTime(b.lastSeenAt) - parsedTime(a.lastSeenAt));
  return {
    ...document,
    observations,
    coverCandidates: [...document.coverCandidates].sort((a, b) => {
      if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
      return parsedTime(b.lastSeenAt) - parsedTime(a.lastSeenAt);
    }),
    runs: [...document.runs].sort((a, b) => parsedTime(b.collectedAt) - parsedTime(a.collectedAt)),
    publications: [...document.publications].sort((a, b) => parsedTime(b.publishedAt) - parsedTime(a.publishedAt)),
    estimates: calculateStoredMarketEstimates(observations, now),
    counts: {
      accepted: observations.filter((item) => item.reviewStatus === "accepted").length,
      pending: observations.filter((item) => item.reviewStatus === "pending").length,
      rejected: observations.filter((item) => item.reviewStatus === "rejected").length,
      current: observations.filter((item) => isCurrentMarketObservation(item, now)).length,
      expired: observations.filter((item) => !isCurrentMarketObservation(item, now)).length,
    },
  };
}

export function mergeMarketResearchDocument(
  current: MarketResearchCatalogDocument,
  input: {
    identity: CatalogIdentity;
    observations: MarketObservation[];
    covers: StoredCoverCandidate[];
    run: MarketResearchRun;
  },
): MarketResearchCatalogDocument {
  const observationMap = new Map(current.observations.map((item) => [item.id, item]));
  for (const incoming of input.observations) {
    const existing = observationMap.get(incoming.id);
    const manuallyReviewed = Boolean(existing?.reviewedAt && existing.reviewedBy);
    observationMap.set(incoming.id, {
      ...existing,
      ...incoming,
      firstSeenAt: existing?.firstSeenAt ?? incoming.firstSeenAt,
      seenCount: Math.max(1, (existing?.seenCount ?? 0) + 1),
      reviewStatus: manuallyReviewed ? existing!.reviewStatus : incoming.reviewStatus,
      reviewedAt: manuallyReviewed ? existing!.reviewedAt : incoming.reviewedAt,
      reviewedBy: manuallyReviewed ? existing!.reviewedBy : incoming.reviewedBy,
    });
  }

  const coverMap = new Map(current.coverCandidates.map((item) => [item.id, item]));
  for (const incoming of input.covers) {
    const existing = coverMap.get(incoming.id);
    coverMap.set(incoming.id, {
      ...existing,
      ...incoming,
      firstSeenAt: existing?.firstSeenAt ?? incoming.firstSeenAt,
      status: existing?.status ?? incoming.status,
      reviewedAt: existing?.reviewedAt ?? incoming.reviewedAt,
      reviewedBy: existing?.reviewedBy ?? incoming.reviewedBy,
      publishedCoverUrl: existing?.publishedCoverUrl ?? incoming.publishedCoverUrl,
    });
  }

  const observations = [...observationMap.values()]
    .sort((a, b) => parsedTime(b.lastSeenAt) - parsedTime(a.lastSeenAt))
    .slice(0, MAX_OBSERVATIONS_PER_GAME);
  const coverCandidates = [...coverMap.values()]
    .sort((a, b) => parsedTime(b.lastSeenAt) - parsedTime(a.lastSeenAt))
    .slice(0, MAX_COVERS_PER_GAME);

  return {
    ...current,
    ...input.identity,
    schemaVersion: 1,
    updatedAt: input.run.collectedAt,
    lastCollectedAt: input.run.collectedAt,
    observations,
    coverCandidates,
    runs: [input.run, ...current.runs.filter((run) => run.id !== input.run.id)].slice(0, MAX_RUNS_PER_GAME),
    publications: current.publications.slice(0, MAX_PUBLICATIONS_PER_GAME),
  };
}

export async function readMarketResearchCatalog(identity: CatalogIdentity): Promise<MarketResearchCatalogView> {
  return toView(await readDocument(identity));
}

export async function saveMarketResearchCatalog(input: {
  identity: CatalogIdentity;
  observations: MarketObservation[];
  covers: StoredCoverCandidate[];
  run: MarketResearchRun;
}): Promise<MarketResearchCatalogView> {
  return mutateDocument(input.identity, (current) => {
    const next = mergeMarketResearchDocument(current, input);
    return { next, result: toView(next) };
  });
}

export async function reviewMarketObservation(input: {
  identity: CatalogIdentity;
  observationId: string;
  status: MarketObservationReviewStatus;
  reviewedBy: string;
}): Promise<MarketResearchCatalogView | { error: string }> {
  return mutateDocument<MarketResearchCatalogView | { error: string }>(input.identity, (current) => {
    const index = current.observations.findIndex((item) => item.id === input.observationId);
    if (index < 0) return { next: current, result: { error: "Evidencia no encontrada." }, changed: false };
    const observations = [...current.observations];
    observations[index] = {
      ...observations[index],
      reviewStatus: input.status,
      reviewedAt: new Date().toISOString(),
      reviewedBy: input.reviewedBy,
    };
    const next = { ...current, observations, updatedAt: new Date().toISOString() };
    return { next, result: toView(next) };
  });
}

export async function reviewStoredCoverCandidate(input: {
  identity: CatalogIdentity;
  candidateId: string;
  status: "approved" | "rejected";
  reviewedBy: string;
  publishedCoverUrl?: string | null;
}): Promise<MarketResearchCatalogView | { error: string }> {
  return mutateDocument<MarketResearchCatalogView | { error: string }>(input.identity, (current) => {
    const index = current.coverCandidates.findIndex((item) => item.id === input.candidateId);
    if (index < 0) return { next: current, result: { error: "Candidato de portada no encontrado." }, changed: false };
    const coverCandidates = [...current.coverCandidates];
    coverCandidates[index] = {
      ...coverCandidates[index],
      status: input.status,
      reviewedAt: new Date().toISOString(),
      reviewedBy: input.reviewedBy,
      publishedCoverUrl: input.publishedCoverUrl ?? coverCandidates[index].publishedCoverUrl,
    };
    const next = { ...current, coverCandidates, updatedAt: new Date().toISOString() };
    return { next, result: toView(next) };
  });
}

export async function recordMarketPublication(input: {
  identity: CatalogIdentity;
  publication: MarketResearchPublication;
}): Promise<MarketResearchCatalogView> {
  return mutateDocument(input.identity, (current) => {
    const next = {
      ...current,
      updatedAt: input.publication.publishedAt,
      publications: [
        input.publication,
        ...current.publications.filter((item) => item.id !== input.publication.id),
      ].slice(0, MAX_PUBLICATIONS_PER_GAME),
    };
    return { next, result: toView(next) };
  });
}

export type { CatalogIdentity, MarketResearchCatalogDocument };
