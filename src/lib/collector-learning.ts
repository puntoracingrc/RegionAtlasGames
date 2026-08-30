import { decodeHtmlEntities } from "./decode-html-entities";
import { normalizeOriginalGameContents } from "./original-game-contents";

export const COLLECTOR_LEARNING_SCHEMA_VERSION = 1;
export const COLLECTOR_INTELLIGENCE_POLICY = "collector-intelligence-v1";

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
};

export type CollectorLearningQuery = {
  query: string;
  acceptedCount: number;
  lastAcceptedAt: string;
};

export type CollectorLearningGame = {
  catalogId: string;
  approvedExamples: CollectorLearningExample[];
  manualExpected?: boolean;
  originalContentsExpected?: string[];
  successfulQueries: Record<string, CollectorLearningQuery[]>;
};

export type CollectorLearningSnapshot = {
  schemaVersion: number;
  policyVersion: string;
  updatedAt: string;
  games: Record<string, CollectorLearningGame>;
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
    manualExpected?: boolean;
    originalContentsExpected?: string[];
    contentDecidedAt: string;
    queries: Map<string, Map<string, CollectorLearningQuery>>;
  }>();

  for (const rawItem of items) {
    const item = record(rawItem);
    const decision = record(item.decision);
    if (!isApprovedDecision(item, decision)) continue;

    const catalogId = acceptedCatalogId(item, decision);
    const source = cleanSource(item.source);
    if (!catalogId || !source) continue;
    const evidence = record(item.evidence);
    const decidedAt = cleanText(item.decidedAt ?? item.updatedAt, 80) || updatedAt;
    const game = games.get(catalogId) ?? {
      catalogId,
      examples: [],
      contentDecidedAt: "",
      queries: new Map<string, Map<string, CollectorLearningQuery>>(),
    };

    const imageUrls = cleanImageUrls(evidence);
    const region = cleanText(decision.region ?? item.detectedRegion ?? item.targetRegion, 120) || null;
    const condition = cleanText(decision.condition ?? item.condition, 80) || null;
    const regionEvidence = cleanStringList(evidence.regionEvidence, 16, 120);
    const note = cleanText(decision.note, 500) || null;
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
  };
}
