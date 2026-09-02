import { decodeHtmlEntities } from "./decode-html-entities";
import { normalizeOriginalGameContents } from "./original-game-contents";

export const COLLECTOR_LEARNING_SCHEMA_VERSION = 1;
export const COLLECTOR_INTELLIGENCE_POLICY = "collector-intelligence-v1";

export const PRICE_REVIEW_REJECT_REASON_CODES = [
  "duplicate",
  "wrong_game",
  "wrong_platform",
  "wrong_edition",
  "wrong_region",
  "non_game",
  "lot_or_bundle",
  "condition_unverified",
  "price_anomaly",
  "insufficient_evidence",
  "other",
] as const;

export type PriceReviewRejectReason = typeof PRICE_REVIEW_REJECT_REASON_CODES[number];

type UnknownRecord = Record<string, unknown>;

export type CollectorLearningExample = {
  source: string;
  region: string | null;
  condition: string | null;
  regionEvidence: string[];
  note: string | null;
  imageUrls: string[];
  searchQuery: string | null;
  decidedAt: string;
  visualObservations: CollectorLearningVisualObservation[];
};

export type CollectorLearningVisualObservation = {
  imageIndex: number;
  role: string;
  ratingSystems: string[];
  languages: string[];
  productCodes: string[];
  barcodes: string[];
  distributors: string[];
  editionMarkers: string[];
};

export type CollectorLearningRejectedExample = {
  source: string;
  reasonCode: PriceReviewRejectReason;
  detectedRegion: string | null;
  regionEvidence: string[];
  note: string | null;
  imageUrls: string[];
  decidedAt: string;
  visualObservations: CollectorLearningVisualObservation[];
};

export type CollectorLearningQuery = {
  query: string;
  acceptedCount: number;
  lastAcceptedAt: string;
};

export type CollectorLearningGame = {
  catalogId: string;
  approvedExamples: CollectorLearningExample[];
  rejectedExamples: CollectorLearningRejectedExample[];
  manualExpected?: boolean;
  originalContentsExpected?: string[];
  successfulQueries: Record<string, CollectorLearningQuery[]>;
};

export type CollectorLearningSnapshot = {
  schemaVersion: number;
  policyVersion: string;
  updatedAt: string;
  games: Record<string, CollectorLearningGame>;
  rejectionSummary: Record<string, Partial<Record<PriceReviewRejectReason, number>>>;
};

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function cleanText(value: unknown, maxLength = 500): string {
  let text = String(value ?? "").trim();
  for (let index = 0; index < 5; index += 1) {
    const decoded = decodeHtmlEntities(text);
    if (decoded === text) break;
    text = decoded;
  }
  return text.replace(/\s+/g, " ").slice(0, maxLength).trim();
}

function cleanSource(value: unknown): string {
  const source = cleanText(value, 80).toLowerCase();
  return ({
    ebay: "ebay-es",
    vinted: "vinted-es",
    tcns: "todoconsolas",
    kaoto: "kaotostore",
    jgo: "japangameonline",
  } as Record<string, string>)[source] ?? source;
}

function cleanCatalogId(value: unknown): string {
  return String(value ?? "").trim().slice(0, 240);
}

function cleanStringList(value: unknown, limit = 20, maxLength = 120): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .map((item) => cleanText(item, maxLength))
      .filter(Boolean),
  )].slice(0, limit);
}

function cleanImageUrls(evidence: UnknownRecord): string[] {
  const urls = [evidence.imageUrl, ...(Array.isArray(evidence.imageUrls) ? evidence.imageUrls : [])]
    .map((value) => cleanText(value, 2_000))
    .filter((value) => /^https:\/\//i.test(value));
  return [...new Set(urls)].slice(0, 4);
}

const VISUAL_REJECT_REASONS = new Set<PriceReviewRejectReason>([
  "wrong_game",
  "wrong_platform",
  "wrong_edition",
  "wrong_region",
  "non_game",
  "lot_or_bundle",
]);

function cleanVisualObservations(evidence: UnknownRecord): CollectorLearningVisualObservation[] {
  const coverVision = record(evidence.coverVision);
  const observations = Array.isArray(coverVision.observations) ? coverVision.observations : [];
  return observations.flatMap((rawObservation, index) => {
    const observation = record(rawObservation);
    const imageIndex = Number(observation.imageIndex ?? index + 1);
    const role = cleanText(observation.role, 24).toLowerCase() || "other";
    if (!Number.isInteger(imageIndex) || imageIndex < 1 || imageIndex > 8) return [];
    return [{
      imageIndex,
      role,
      ratingSystems: cleanStringList(observation.ratingSystems, 4, 16),
      languages: cleanStringList(observation.languages, 12, 8),
      productCodes: cleanStringList(observation.productCodes, 8, 48),
      barcodes: cleanStringList(observation.barcodes, 4, 20),
      distributors: cleanStringList(observation.distributors, 6, 80),
      editionMarkers: cleanStringList(observation.editionMarkers, 6, 80),
    }];
  }).slice(0, 8);
}

function normalizeRejectReason(value: unknown): PriceReviewRejectReason | null {
  const clean = cleanText(value, 80).toLowerCase();
  return (PRICE_REVIEW_REJECT_REASON_CODES as readonly string[]).includes(clean)
    ? clean as PriceReviewRejectReason
    : null;
}

export function inferPriceReviewRejectReason(
  itemValue: unknown,
  decisionValue?: unknown,
): PriceReviewRejectReason {
  const item = record(itemValue);
  const decision = record(decisionValue ?? item.decision);
  const explicit = normalizeRejectReason(decision.reasonCode);
  if (explicit) return explicit;
  const text = cleanText([
    decision.note,
    item.triageReason,
    item.reason,
  ].filter(Boolean).join(" "), 1_000).toLowerCase();
  if (/duplic|repetid|mismo anuncio/.test(text)) return "duplicate";
  if (/lote|bundle|pack de juegos|varios juegos/.test(text)) return "lot_or_bundle";
  if (/plataforma|consola equivoc|versi[oó]n de (ps|xbox|switch)/.test(text)) return "wrong_platform";
  if (/edici[oó]n|edition|deluxe|collector|steelbook|launch|est[aá]ndar/.test(text)) return "wrong_edition";
  if (/regi[oó]n|pal|ntsc|usa|jap[oó]n|francia|italia|alemania|uk/.test(text)) return "wrong_region";
  if (/accesorio|figura|manual suelto|solo caja|caja vac[ií]a|consola|mando/.test(text)) return "non_game";
  if (/precio|importe|an[oó]mal|fuera de rango/.test(text)) return "price_anomaly";
  if (/estado|condition|precint|completo/.test(text)) return "condition_unverified";
  if (/evidencia|no concluyente|sin prueba|no confirmad/.test(text)) return "insufficient_evidence";
  if (/juego incorrecto|otro juego|t[ií]tulo incorrecto|no coincide/.test(text)) return "wrong_game";
  return "other";
}

function acceptedCatalogId(item: UnknownRecord, decision: UnknownRecord): string {
  return cleanCatalogId(
    decision.catalogId ?? item.catalogId ?? item.candidateCatalogId,
  );
}

function isApprovedDecision(item: UnknownRecord, decision: UnknownRecord): boolean {
  return item.status === "accepted" && decision.action === "accept";
}

function latestIso(left: string, right: string): string {
  return right > left ? right : left;
}

export function buildCollectorLearningSnapshot(
  queue: unknown,
  updatedAt = new Date().toISOString(),
): CollectorLearningSnapshot {
  const queueRecord = record(queue);
  const items = Array.isArray(queueRecord.items) ? queueRecord.items : [];
  const games = new Map<string, {
    catalogId: string;
    examples: CollectorLearningExample[];
    rejectedExamples: CollectorLearningRejectedExample[];
    manualExpected?: boolean;
    originalContentsExpected?: string[];
    contentDecidedAt: string;
    queries: Map<string, Map<string, CollectorLearningQuery>>;
  }>();
  const rejectionSummary: Record<string, Partial<Record<PriceReviewRejectReason, number>>> = {};

  for (const rawItem of items) {
    const item = record(rawItem);
    const decision = record(item.decision);
    const isApproved = isApprovedDecision(item, decision);
    const isRejected = item.status === "rejected" && decision.action === "reject";
    if (!isApproved && !isRejected) continue;

    const catalogId = acceptedCatalogId(item, decision);
    const source = cleanSource(item.source);
    if (!source) continue;
    if (isRejected) {
      const reasonCode = inferPriceReviewRejectReason(item, decision);
      const sourceSummary = rejectionSummary[source] ?? {};
      sourceSummary[reasonCode] = (sourceSummary[reasonCode] ?? 0) + 1;
      rejectionSummary[source] = sourceSummary;
    }
    if (!catalogId) continue;
    const evidence = record(item.evidence);
    const decidedAt = cleanText(item.decidedAt ?? item.updatedAt, 80) || updatedAt;
    const game = games.get(catalogId) ?? {
      catalogId,
      examples: [],
      rejectedExamples: [],
      contentDecidedAt: "",
      queries: new Map<string, Map<string, CollectorLearningQuery>>(),
    };

    const imageUrls = cleanImageUrls(evidence);
    const region = cleanText(decision.region ?? item.detectedRegion ?? item.targetRegion, 120) || null;
    const condition = cleanText(decision.condition ?? item.condition, 80) || null;
    const regionEvidence = cleanStringList(evidence.regionEvidence, 16, 120);
    const note = cleanText(decision.note, 500) || null;
    const visualObservations = cleanVisualObservations(evidence);
    if (isRejected) {
      const reasonCode = inferPriceReviewRejectReason(item, decision);
      if (VISUAL_REJECT_REASONS.has(reasonCode) && imageUrls.length) {
        game.rejectedExamples.push({
          source,
          reasonCode,
          detectedRegion: cleanText(item.detectedRegion, 120) || null,
          regionEvidence,
          note,
          imageUrls,
          decidedAt,
          visualObservations,
        });
      }
      games.set(catalogId, game);
      continue;
    }
    if (imageUrls.length || region || condition || regionEvidence.length || note) {
      game.examples.push({
        source,
        region,
        condition,
        regionEvidence,
        note,
        imageUrls,
        searchQuery: cleanText(evidence.searchQuery, 180) || null,
        decidedAt,
        visualObservations,
      });
    }

    const explicitContents = Array.isArray(decision.originalContents)
      ? normalizeOriginalGameContents(decision.originalContents)
      : null;
    const evidenceManual = typeof evidence.manualExpected === "boolean"
      ? evidence.manualExpected
      : undefined;
    if (decidedAt >= game.contentDecidedAt && (explicitContents !== null || evidenceManual !== undefined)) {
      game.contentDecidedAt = decidedAt;
      if (explicitContents !== null) {
        game.originalContentsExpected = explicitContents;
        game.manualExpected = explicitContents.includes("manual");
      } else {
        game.manualExpected = evidenceManual;
      }
    }

    const query = cleanText(evidence.searchQuery, 180);
    if (query) {
      const sourceQueries = game.queries.get(source) ?? new Map<string, CollectorLearningQuery>();
      const queryKey = query.toLocaleLowerCase("es");
      const previous = sourceQueries.get(queryKey);
      sourceQueries.set(queryKey, {
        query,
        acceptedCount: (previous?.acceptedCount ?? 0) + 1,
        lastAcceptedAt: latestIso(previous?.lastAcceptedAt ?? "", decidedAt),
      });
      game.queries.set(source, sourceQueries);
    }
    games.set(catalogId, game);
  }

  const serializedGames: Record<string, CollectorLearningGame> = {};
  for (const [catalogId, game] of [...games.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const successfulQueries: Record<string, CollectorLearningQuery[]> = {};
    for (const [source, values] of [...game.queries.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      successfulQueries[source] = [...values.values()]
        .sort((left, right) => (
          right.acceptedCount - left.acceptedCount
          || right.lastAcceptedAt.localeCompare(left.lastAcceptedAt)
          || left.query.localeCompare(right.query)
        ))
        .slice(0, 5);
    }
    serializedGames[catalogId] = {
      catalogId,
      approvedExamples: game.examples
        .sort((left, right) => right.decidedAt.localeCompare(left.decidedAt))
        .slice(0, 3),
      rejectedExamples: game.rejectedExamples
        .sort((left, right) => right.decidedAt.localeCompare(left.decidedAt))
        .slice(0, 3),
      ...(game.manualExpected === undefined ? {} : { manualExpected: game.manualExpected }),
      ...(game.originalContentsExpected === undefined
        ? {}
        : { originalContentsExpected: game.originalContentsExpected }),
      successfulQueries,
    };
  }

  return {
    schemaVersion: COLLECTOR_LEARNING_SCHEMA_VERSION,
    policyVersion: COLLECTOR_INTELLIGENCE_POLICY,
    updatedAt,
    games: serializedGames,
    rejectionSummary,
  };
}
