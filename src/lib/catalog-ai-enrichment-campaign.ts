import { createHash } from "node:crypto";
import type { AdminAiFillRunResult } from "./admin-ai-fill";
import type { AdminGameDraft } from "./admin-draft-types";
import type { CatalogGame, GameDetails } from "./types";

export const CATALOG_AI_ENRICHMENT_SCHEMA_VERSION = 1;

export type CatalogAiEnrichmentMode = "missing" | "force";
export type CatalogAiEnrichmentPlatform = "ps4" | "ps5" | "switch2";
export type CatalogAiProposalStatus = "ready" | "review" | "error";

export type CatalogAiEnrichmentProposal = {
  catalogId: string;
  title: string;
  platformSlug: CatalogAiEnrichmentPlatform;
  region: string;
  status: CatalogAiProposalStatus;
  qualityScore: number;
  beforeFingerprint: string;
  fieldsUpdated: string[];
  sources: string[];
  urls: string[];
  steamTags: string[];
  warnings: string[];
  qualitySignals: AdminAiFillRunResult["qualitySignals"];
  descriptionPreview: string | null;
  seoPreview: string | null;
  draft: AdminGameDraft | null;
  error: string | null;
  logTail: string[];
};

export type CatalogAiEnrichmentResult = {
  schemaVersion: typeof CATALOG_AI_ENRICHMENT_SCHEMA_VERSION;
  source: "region-atlas-catalog-ai";
  mode: "proposal-only";
  containsWrites: false;
  generatedAt: string;
  model: string;
  platformSlug: CatalogAiEnrichmentPlatform;
  enrichmentMode: CatalogAiEnrichmentMode;
  cursor: {
    startAfterCatalogId: string | null;
    nextCatalogId: string | null;
    hasMore: boolean;
  };
  stats: {
    catalogGames: number;
    incompleteBefore: number;
    selected: number;
    ready: number;
    review: number;
    errors: number;
  };
  proposals: CatalogAiEnrichmentProposal[];
};

function hasSeoDescription(details: GameDetails | null | undefined): boolean {
  return Boolean(details?.seoMeta?.seoDescription?.trim());
}

export function catalogGameNeedsAiEnrichment(details: GameDetails | null | undefined): boolean {
  return !(
    details?.description?.trim() &&
    hasSeoDescription(details) &&
    details.developer?.name?.trim() &&
    details.publisher?.name?.trim() &&
    (details.genres?.length ?? 0) > 0
  );
}

export function catalogAiBeforeFingerprint(game: CatalogGame, details: GameDetails | null | undefined): string {
  return createHash("sha256")
    .update(JSON.stringify({
      catalogId: game.id,
      title: game.title,
      platformSlug: game.platformSlug,
      region: game.region,
      details: details ?? null,
    }))
    .digest("hex")
    .slice(0, 20);
}

function hasPlatformOfficialSource(run: AdminAiFillRunResult, platformSlug: string): boolean {
  if (platformSlug.startsWith("ps")) {
    return run.sources.some((source) => /playstation store/i.test(source));
  }
  if (platformSlug.startsWith("switch")) {
    return run.sources.some((source) => /nintendo (store|oficial)/i.test(source));
  }
  if (platformSlug.startsWith("xbox")) {
    return run.sources.some((source) => /(xbox|microsoft) store/i.test(source));
  }
  if (platformSlug === "pc") {
    return run.sources.some((source) => /^steam$/i.test(source));
  }
  return run.sources.some((source) => /\boficial\b|\bstore\b/i.test(source));
}

function hasAnyOfficialSource(run: AdminAiFillRunResult): boolean {
  return run.sources.some((source) => /\boficial\b|\bstore\b|^steam$/i.test(source));
}

function descriptionLengthOk(draft: AdminGameDraft): boolean {
  const length = draft.description?.trim().length ?? 0;
  return length >= 120 && length <= 900;
}

function seoLengthOk(draft: AdminGameDraft): boolean {
  const length = draft.seoMeta?.seoDescription?.trim().length ?? 0;
  return length >= 70 && length <= 155;
}

export function buildCatalogAiProposal(input: {
  game: CatalogGame;
  details: GameDetails | null | undefined;
  run: AdminAiFillRunResult;
}): CatalogAiEnrichmentProposal {
  const { game, details, run } = input;
  const draft = run.finalDraft;
  const warnings: string[] = [];
  const originality = run.qualitySignals.find((signal) => signal.metric === "description-originality");
  const editorialStyle = run.qualitySignals.find((signal) => signal.metric === "editorial-style");
  const hasPrimarySource = hasPlatformOfficialSource(run, game.platformSlug);
  const hasTraceableEvidence = run.urls.length > 0;

  if (!hasPrimarySource) warnings.push("Sin fuente oficial directa de la plataforma; requiere revisión humana.");
  if (run.urls.length < 2) warnings.push("Solo se obtuvo una fuente o ninguna.");
  if (!draft?.developerName) warnings.push("Falta desarrolladora.");
  if (!draft?.publisherName) warnings.push("Falta editora.");
  if (!draft || !descriptionLengthOk(draft)) warnings.push("Descripción ausente o fuera de longitud.");
  if (!draft || !seoLengthOk(draft)) warnings.push("SEO ausente o fuera de longitud.");
  if (originality && !originality.passed) warnings.push("La descripción no superó el control de originalidad.");
  if (!editorialStyle?.passed) warnings.push("La redacción no superó el control de tono editorial.");

  let qualityScore = 0;
  if (draft) qualityScore += 5;
  if (hasPrimarySource) qualityScore += 20;
  else if (hasAnyOfficialSource(run)) qualityScore += 10;
  if (run.urls.length >= 2) qualityScore += 10;
  else if (run.urls.length === 1) qualityScore += 5;
  if (draft && descriptionLengthOk(draft)) qualityScore += 20;
  if (originality?.passed) qualityScore += 15;
  else if (!originality && draft?.description) qualityScore += 5;
  if (draft?.developerName) qualityScore += 10;
  if (draft?.publisherName) qualityScore += 5;
  if ((draft?.genreNames.length ?? 0) > 0) qualityScore += 5;
  if (draft?.players) qualityScore += 2;
  if (draft && seoLengthOk(draft)) qualityScore += 8;

  const hardReadyChecks = Boolean(
    draft &&
      !run.error &&
      descriptionLengthOk(draft) &&
      seoLengthOk(draft) &&
      draft.developerName &&
      draft.publisherName &&
      (draft.genreNames.length > 0) &&
      originality?.passed &&
      editorialStyle?.passed &&
      hasTraceableEvidence &&
      (hasPrimarySource || run.urls.length >= 2),
  );
  const status: CatalogAiProposalStatus = run.error || !draft
    ? "error"
    : hardReadyChecks && qualityScore >= 75
      ? "ready"
      : "review";

  return {
    catalogId: game.id,
    title: game.title,
    platformSlug: game.platformSlug as CatalogAiEnrichmentPlatform,
    region: game.region,
    status,
    qualityScore: Math.min(100, qualityScore),
    beforeFingerprint: catalogAiBeforeFingerprint(game, details),
    fieldsUpdated: run.fieldsUpdated,
    sources: run.sources,
    urls: run.urls.filter((url) => /^https:\/\//i.test(url)).slice(0, 12),
    steamTags: run.steamTags.slice(0, 20),
    warnings,
    qualitySignals: run.qualitySignals,
    descriptionPreview: draft?.description ?? null,
    seoPreview: draft?.seoMeta?.seoDescription ?? null,
    draft,
    error: run.error,
    logTail: run.logs.slice(-80),
  };
}

function isPlatform(value: unknown): value is CatalogAiEnrichmentPlatform {
  return value === "ps4" || value === "ps5" || value === "switch2";
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function isBoundedStringArray(
  value: unknown,
  maxItems: number,
  maxLength: number,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => isBoundedString(item, maxLength))
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function hasBoundedJsonSize(value: unknown, maxLength: number): boolean {
  try {
    return JSON.stringify(value).length <= maxLength;
  } catch {
    return false;
  }
}

function isQualitySignal(value: unknown): value is AdminAiFillRunResult["qualitySignals"][number] {
  if (!value || typeof value !== "object") return false;
  const signal = value as Partial<AdminAiFillRunResult["qualitySignals"][number]>;
  return (
    (signal.metric === "description-originality" || signal.metric === "editorial-style") &&
    Number.isFinite(signal.score) &&
    Number(signal.score) >= 0 &&
    Number(signal.score) <= 100 &&
    typeof signal.passed === "boolean" &&
    isBoundedString(signal.detail, 500)
  );
}

export function normalizeCatalogAiEnrichmentResult(value: unknown): CatalogAiEnrichmentResult | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CatalogAiEnrichmentResult>;
  if (
    raw.schemaVersion !== CATALOG_AI_ENRICHMENT_SCHEMA_VERSION ||
    raw.source !== "region-atlas-catalog-ai" ||
    raw.mode !== "proposal-only" ||
    raw.containsWrites !== false ||
    !isPlatform(raw.platformSlug) ||
    (raw.enrichmentMode !== "missing" && raw.enrichmentMode !== "force") ||
    !Array.isArray(raw.proposals) ||
    raw.proposals.length > 20 ||
    !raw.stats ||
    !raw.cursor ||
    !isBoundedString(raw.generatedAt, 80) ||
    !Number.isFinite(Date.parse(raw.generatedAt)) ||
    !isBoundedString(raw.model, 120) ||
    !isNonNegativeInteger(raw.stats.catalogGames) ||
    !isNonNegativeInteger(raw.stats.incompleteBefore) ||
    !isNonNegativeInteger(raw.stats.selected) ||
    !isNonNegativeInteger(raw.stats.ready) ||
    !isNonNegativeInteger(raw.stats.review) ||
    !isNonNegativeInteger(raw.stats.errors) ||
    !(raw.cursor.startAfterCatalogId === null || isBoundedString(raw.cursor.startAfterCatalogId, 240)) ||
    !(raw.cursor.nextCatalogId === null || isBoundedString(raw.cursor.nextCatalogId, 240)) ||
    typeof raw.cursor.hasMore !== "boolean"
  ) {
    return null;
  }

  const proposals = raw.proposals.filter((proposal): proposal is CatalogAiEnrichmentProposal => {
    if (!proposal || typeof proposal !== "object") return false;
    if (!hasBoundedJsonSize(proposal, 150_000)) return false;
    if (
      !isBoundedString(proposal.catalogId, 240) ||
      !proposal.catalogId ||
      !isBoundedString(proposal.title, 400) ||
      !proposal.title ||
      proposal.platformSlug !== raw.platformSlug ||
      !isBoundedString(proposal.region, 120) ||
      !/^[a-f0-9]{20}$/.test(proposal.beforeFingerprint)
    ) {
      return false;
    }
    if (!["ready", "review", "error"].includes(proposal.status)) return false;
    if (!Number.isFinite(proposal.qualityScore) || proposal.qualityScore < 0 || proposal.qualityScore > 100) return false;
    if (
      !isBoundedStringArray(proposal.fieldsUpdated, 60, 120) ||
      !isBoundedStringArray(proposal.sources, 30, 200) ||
      !isBoundedStringArray(proposal.urls, 12, 2_048) ||
      !proposal.urls.every((url) => /^https:\/\//i.test(url)) ||
      !isBoundedStringArray(proposal.steamTags, 20, 120) ||
      !isBoundedStringArray(proposal.warnings, 30, 800) ||
      !Array.isArray(proposal.qualitySignals) ||
      proposal.qualitySignals.length > 10 ||
      !proposal.qualitySignals.every(isQualitySignal) ||
      !isBoundedStringArray(proposal.logTail, 80, 2_000) ||
      !(proposal.descriptionPreview === null || isBoundedString(proposal.descriptionPreview, 1_200)) ||
      !(proposal.seoPreview === null || isBoundedString(proposal.seoPreview, 300)) ||
      !(proposal.error === null || isBoundedString(proposal.error, 1_000))
    ) {
      return false;
    }
    if (proposal.draft) {
      if (
        proposal.draft.catalogId !== proposal.catalogId ||
        proposal.draft.platformSlug !== proposal.platformSlug ||
        proposal.draft.region !== proposal.region
      ) {
        return false;
      }
      const unsafeDraft = proposal.draft as unknown as Record<string, unknown>;
      if (["recommendedPrice", "marketMin", "marketMax", "priceSource"].some((key) => key in unsafeDraft)) return false;
    }
    return true;
  });
  if (proposals.length !== raw.proposals.length) return null;
  const ready = proposals.filter((proposal) => proposal.status === "ready").length;
  const review = proposals.filter((proposal) => proposal.status === "review").length;
  const errors = proposals.filter((proposal) => proposal.status === "error").length;
  if (
    raw.stats.selected !== proposals.length ||
    raw.stats.ready !== ready ||
    raw.stats.review !== review ||
    raw.stats.errors !== errors
  ) {
    return null;
  }

  return raw as CatalogAiEnrichmentResult;
}
