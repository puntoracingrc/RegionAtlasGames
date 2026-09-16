import { createHash, randomUUID } from "node:crypto";
import type { ResearchComponent, ResearchEvidenceGap, ResearchTargetField } from "./research-engine/v2-types";

export const CURATOR_ENGINE_VERSION = "review-curator-v1";
export const CURATOR_DECISIONS = [
  "ACCEPT_EXISTING", "REROUTE_EXISTING", "REJECT", "DEFER", "PROPOSE_NEW_VARIANT", "NEEDS_HUMAN",
] as const;
export type CuratorDecisionKind = (typeof CURATOR_DECISIONS)[number];
export type QueueCuratorStatus = "pending" | "accepted" | "rerouted" | "rejected" | "deferred" | "proposed_variant";

export type PhysicalEvidenceObservationV1 = {
  id: string;
  imageIndex: number;
  component: ResearchComponent;
  productNodeType: "PHYSICAL_PRODUCT" | "OUTER_PACKAGE" | "INNER_PRODUCT" | "MEDIA" | "DOCUMENT" | "STICKER" | "ACCESSORY";
  role: string;
  textSnippets: string[];
  productCodes: string[];
  barcodes: string[];
  languages: string[];
  ratingSystems: string[];
  distributors: string[];
  editionMarkers: string[];
};

export type PhysicalEvidenceBundleV1 = {
  schemaVersion: 1;
  reviewItemId: string;
  queueVersion: string;
  inputHash: string;
  evidenceHash: string;
  source: string;
  capturedAt: string | null;
  reason: string | null;
  triageBucket: string | null;
  listing: { id: string | null; url: string | null; title: string; description: string | null; searchQuery: string | null };
  catalog: { searchedCatalogId: string | null; candidateCatalogId: string | null; alternatives: Array<Record<string, unknown>> };
  subject: { identity: string | null; platform: string | null; edition: string | null; physicalVariant: string | null };
  images: Array<{ index: number; url: string; originalUrl: string | null; hash: string | null }>;
  originalImages: Array<{ index: number; url: string; originalUrl: string | null; hash: string | null }>;
  productGraph: { nodes: Array<Record<string, unknown>>; relations: Array<Record<string, unknown>> };
  observations: PhysicalEvidenceObservationV1[];
  identifiers: Array<{ type: "EAN_UPC" | "PRODUCT_CODE" | "SERIAL"; value: string; component: ResearchComponent; observationId: string }>;
  regional: {
    targetRegion: string | null; detectedRegion: string | null;
    marketBinding: "UNBOUND" | "MARKET_BOUND" | "LANGUAGE_ONLY" | "CONFLICTING" | "REJECTED";
    evidence: string[]; packagingLanguages: string[]; distributors: string[]; ratingSystems: string[];
  };
  condition: {
    bucket: "loose" | "game_manual" | "complete" | "sealed" | "unknown";
    confidence: number | null; evidence: string[]; manualExpected: boolean | null; originalContentsExpected: string[];
  };
  price: { amount: number | null; shipping: number | null; currency: string | null; estimatedTotalToSpain: number | null };
  confidence: number | null;
  conflicts: string[];
  confirmed: string[];
  rejected: string[];
  uncertain: string[];
  evidenceGaps: Array<{ field: string; code: string; missingProof: string; recommendedSourceTypes: string[] }>;
};

export type CuratorResolution = {
  reviewItemId: string;
  runId: string;
  decision: CuratorDecisionKind;
  resolvedCatalogId: string | null;
  previousCatalogId: string | null;
  inputHash: string;
  evidenceHash: string;
  researchEngineVersion: string;
  gitSha: string;
  reason: string;
  confidence: number;
  sources: string[];
  evidenceIds: string[];
  imagesUsed: number[];
  identifiersUsed: string[];
  evidenceGaps: string[];
  braveCalls: number;
  openAiCalls: number;
  costUsd: number;
  createdAt: string;
  resolvedAt: string;
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, row]) => `${JSON.stringify(key)}:${canonical(row)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function curatorHash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.map(String).map((row) => row.trim()).filter(Boolean))] : [];
}

function text(value: unknown): string | null {
  const clean = String(value ?? "").trim();
  return clean || null;
}

export function mapWorkerObservation(raw: Record<string, unknown>, index = 0): PhysicalEvidenceObservationV1 {
  const role = String(raw.role ?? "other").toLowerCase();
  const workerComponent = String(raw.component ?? "other").toLowerCase();
  let component: ResearchComponent = "UNKNOWN_COMPONENT";
  let productNodeType: PhysicalEvidenceObservationV1["productNodeType"] = "PHYSICAL_PRODUCT";
  if (role === "cartridge") { component = "CARTRIDGE_FRONT"; productNodeType = "MEDIA"; }
  else if (role === "disc") { component = "DISC"; productNodeType = "MEDIA"; }
  else if (role === "manual" || workerComponent === "manual") { component = role === "back" ? "MANUAL_BACK" : "MANUAL_FRONT"; productNodeType = "DOCUMENT"; }
  else if (workerComponent === "supplement") {
    const snippet = strings(raw.textSnippets).join(" ").toLowerCase();
    component = /download|descarga/.test(snippet) ? "DOWNLOAD_CARD" : /code|c[oó]digo/.test(snippet) ? "CODE_VOUCHER" : "UNKNOWN_COMPONENT";
    productNodeType = "DOCUMENT";
  } else if (workerComponent === "seal" || role === "seal") productNodeType = "STICKER";
  else if (workerComponent === "extra") productNodeType = "ACCESSORY";
  // workerComponent=box is intentionally not promoted to outer or inner packaging.
  const barcodes = strings(raw.barcodes).map((value) => value.replace(/\D/g, "")).filter((value) => value.length >= 8 && value.length <= 14);
  return {
    id: `obs-${index + 1}-${curatorHash(raw).slice(0, 12)}`,
    imageIndex: Math.max(1, Number(raw.imageIndex) || index + 1), component, productNodeType, role,
    textSnippets: strings(raw.textSnippets), productCodes: strings(raw.productCodes), barcodes,
    languages: strings(raw.languages), ratingSystems: strings(raw.ratingSystems), distributors: strings(raw.distributors), editionMarkers: strings(raw.editionMarkers),
  };
}

function marketBinding(regionEvidence: string[], observations: PhysicalEvidenceObservationV1[]): PhysicalEvidenceBundleV1["regional"]["marketBinding"] {
  // A generic publisher/distributor string is not market proof. Only the
  // upstream regional policy's explicit physical/legal-text signals bind it.
  if (regionEvidence.some((value) => ["sku_regional", "distributor_regional"].includes(value))) return "MARKET_BOUND";
  if (regionEvidence.some((value) => ["back_cover_language", "cover_spain"].includes(value)) || observations.some((row) => row.languages.length)) return "LANGUAGE_ONLY";
  return "UNBOUND";
}

export function physicalEvidenceBundleFromReviewItem(item: Record<string, unknown>, queueVersion: string): PhysicalEvidenceBundleV1 {
  const evidence: Record<string, unknown> = item.evidence && typeof item.evidence === "object" ? item.evidence as Record<string, unknown> : {};
  const coverVision: Record<string, unknown> = evidence.coverVision && typeof evidence.coverVision === "object" ? evidence.coverVision as Record<string, unknown> : {};
  const rawObservations = Array.isArray(evidence.visualObservations) ? evidence.visualObservations : Array.isArray(coverVision.observations) ? coverVision.observations : [];
  const observations: PhysicalEvidenceObservationV1[] = (rawObservations as unknown[])
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map((row, index) => mapWorkerObservation(row, index));
  const regionEvidence = strings(evidence.regionEvidence);
  const binding = marketBinding(regionEvidence, observations);
  const rawCondition = String(item.condition ?? "unknown");
  const condition: PhysicalEvidenceBundleV1["condition"]["bucket"] = ["loose", "game_manual", "complete", "sealed"].includes(rawCondition)
    ? rawCondition as PhysicalEvidenceBundleV1["condition"]["bucket"] : "unknown";
  const imageUrls = strings(evidence.imageUrls);
  const primaryImage = text(evidence.imageUrl);
  if (primaryImage && !imageUrls.includes(primaryImage)) imageUrls.unshift(primaryImage);
  const images = imageUrls.map((url, index) => ({ index: index + 1, url, originalUrl: url, hash: null }));
  const identifiers: PhysicalEvidenceBundleV1["identifiers"] = observations.flatMap((row: PhysicalEvidenceObservationV1) => [
    ...row.barcodes.map((value) => ({ type: "EAN_UPC" as const, value, component: row.component, observationId: row.id })),
    ...row.productCodes.map((value) => ({ type: "PRODUCT_CODE" as const, value, component: row.component, observationId: row.id })),
  ]);
  const gaps: PhysicalEvidenceBundleV1["evidenceGaps"] = [];
  if (binding !== "MARKET_BOUND") gaps.push({ field: "MARKET_REGION", code: "MISSING_MARKET_PROOF", missingProof: "No market-bound physical or distributor evidence.", recommendedSourceTypes: ["EXACT_PHYSICAL_PHOTO", "DISTRIBUTOR"] });
  if (condition === "unknown") gaps.push({ field: "CONDITION", code: "MISSING_COMPONENT_PHOTO", missingProof: "Visible contents do not support a condition bucket.", recommendedSourceTypes: ["EXACT_PHYSICAL_PHOTO"] });
  if (!observations.length) gaps.push({ field: "CANONICAL_IDENTITY", code: "MISSING_COMPONENT_BINDING", missingProof: "No component-level observations reached the queue.", recommendedSourceTypes: ["LISTING_IMAGES"] });
  const inputPayload = Object.fromEntries(Object.entries(item).filter(([key]) => !["decision", "decidedAt", "status", "adminEditedAt", "physicalEvidenceBundle", "curatorResolution", "attemptCount", "lastAttemptAt", "nextEligibleAt"].includes(key)));
  // Keep this payload byte-for-byte compatible with the Python serializer.
  const evidencePayload = {
    listing: evidence,
    observations,
    identifiers,
    region: [item.targetRegion ?? null, item.detectedRegion ?? null, binding],
    condition,
  };
  const identity = coverVision.identity && typeof coverVision.identity === "object" ? coverVision.identity as Record<string, unknown> : {};
  const identityConflicts = [
    identity.titleMatches === false ? "wrong_game" : "",
    identity.platformMatches === false ? "wrong_platform" : "",
    identity.editionMatches === false ? "wrong_edition" : "",
  ].filter(Boolean);
  const identityConfirmed = coverVision.isTargetGame === true;
  const identityRejected = coverVision.isTargetGame === false;
  const bundle: PhysicalEvidenceBundleV1 = {
    schemaVersion: 1, reviewItemId: String(item.id ?? ""), queueVersion,
    inputHash: curatorHash(inputPayload), evidenceHash: curatorHash(evidencePayload), source: String(item.source ?? "unknown"),
    capturedAt: text(item.collectedAt), reason: text(item.reason), triageBucket: text(item.triageBucket),
    listing: { id: text(evidence.externalId), url: text(evidence.url), title: String(item.listingTitle ?? ""), description: text(evidence.description), searchQuery: text(evidence.searchQuery) },
    catalog: { searchedCatalogId: text(evidence.searchedCatalogId ?? item.catalogId), candidateCatalogId: text(item.candidateCatalogId ?? item.catalogId), alternatives: Array.isArray(evidence.matchAlternatives) ? evidence.matchAlternatives : [] },
    subject: { identity: text(evidence.catalogTitle ?? item.listingTitle), platform: text(item.platformSlug), edition: text(evidence.detectedPhysicalEdition ?? evidence.targetPhysicalEdition), physicalVariant: text(evidence.physicalVariant) },
    images, originalImages: images, productGraph: { nodes: [], relations: [] }, observations, identifiers,
    regional: { targetRegion: text(item.targetRegion), detectedRegion: text(item.detectedRegion), marketBinding: binding, evidence: regionEvidence, packagingLanguages: [...new Set(observations.flatMap((row) => row.languages))], distributors: [...new Set(observations.flatMap((row) => row.distributors))], ratingSystems: [...new Set(observations.flatMap((row) => row.ratingSystems))] },
    condition: { bucket: condition, confidence: typeof coverVision.conditionConfidence === "number" ? coverVision.conditionConfidence : null, evidence: strings(coverVision.sellerClaims), manualExpected: typeof evidence.manualExpected === "boolean" ? evidence.manualExpected : null, originalContentsExpected: strings(evidence.originalContentsExpected) },
    price: { amount: typeof item.priceEur === "number" ? item.priceEur : null, shipping: typeof evidence.shippingEur === "number" ? evidence.shippingEur : null, currency: text(evidence.originalCurrency ?? "EUR"), estimatedTotalToSpain: typeof evidence.estimatedTotalToSpainEur === "number" ? evidence.estimatedTotalToSpainEur : null },
    confidence: typeof evidence.aiConfidence === "number" ? evidence.aiConfidence : null, conflicts: [...strings(coverVision.validationWarnings), ...identityConflicts],
    confirmed: [identityConfirmed ? "identity" : item.candidateCatalogId || item.catalogId ? "candidate_identity" : "", item.platformSlug ? "platform_candidate" : "", binding === "MARKET_BOUND" ? "market_region" : "", condition !== "unknown" ? "condition" : ""].filter(Boolean),
    rejected: identityRejected ? ["identity"] : [], uncertain: [!identityConfirmed && !identityRejected ? "identity" : "", binding !== "MARKET_BOUND" ? "market_region" : "", condition === "unknown" ? "condition" : ""].filter(Boolean), evidenceGaps: gaps,
  };
  return bundle;
}

export function validatePhysicalEvidenceBundle(value: unknown): asserts value is PhysicalEvidenceBundleV1 {
  if (!value || typeof value !== "object") throw new Error("PhysicalEvidenceBundleV1 must be an object.");
  const row = value as Partial<PhysicalEvidenceBundleV1>;
  if (row.schemaVersion !== 1 || !row.reviewItemId || !/^[a-f0-9]{64}$/.test(row.inputHash ?? "") || !/^[a-f0-9]{64}$/.test(row.evidenceHash ?? "")) throw new Error("Invalid PhysicalEvidenceBundleV1 header.");
  if (!row.listing || !row.catalog || !row.regional || !row.condition || !Array.isArray(row.observations) || !Array.isArray(row.evidenceGaps)) throw new Error("Incomplete PhysicalEvidenceBundleV1.");
}

const gapFieldMap: Record<string, ResearchTargetField> = {
  MARKET_REGION: "MARKET_REGION", CONDITION: "BUNDLE_CONTENTS", CANONICAL_IDENTITY: "CANONICAL_IDENTITY",
  BARCODE: "BARCODE", PRODUCT_CODE: "PRODUCT_CODE", EDITION: "CANONICAL_IDENTITY",
};

export function researchTasksFromBundle(bundle: PhysicalEvidenceBundleV1): ResearchEvidenceGap[] {
  return bundle.evidenceGaps.map((gap) => ({
    field: gapFieldMap[gap.field] ?? "CANONICAL_IDENTITY",
    type: gap.code === "MISSING_MARKET_PROOF" ? "MISSING_MARKET_PROOF" : gap.code === "MISSING_COMPONENT_BINDING" ? "MISSING_COMPONENT_BINDING" : "MISSING_SECOND_SOURCE",
    candidateValue: gap.field === "MARKET_REGION" ? bundle.regional.detectedRegion : null,
    missingProof: gap.missingProof,
    recommendedActions: gap.field === "MARKET_REGION" ? ["INSPECT_LEGAL_TEXT", "INSPECT_DISTRIBUTOR_TEXT", "SEARCH_EXACT_MARKET_PACKAGE"] : ["OPEN_EXISTING_GALLERIES", "SEARCH_SECOND_INDEPENDENT_SOURCE"],
    recommendedSourceTypes: gap.recommendedSourceTypes,
    exhaustedActions: [],
  }));
}

function normalized(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function canonicalPlatform(value: string | null | undefined): string {
  const platform = normalized(value).replace(/[^a-z0-9]+/g, "");
  const aliases: Record<string, string> = {
    playstation2: "ps2", playstation3: "ps3", playstation4: "ps4", playstation5: "ps5",
    nintendowii: "wii", nintendowiiu: "wiiu", nintendoswitch: "switch",
    nintendods: "ds", nintendo3ds: "3ds", xbox360: "xbox360", xboxone: "xboxone",
    xboxseries: "xboxseries", xboxseriesxs: "xboxseries", gameboycolor: "gbc",
    gameboyadvance: "gba", gameboy: "gameboy", windows: "pc",
  };
  return aliases[platform] ?? platform;
}

function observedPlatforms(value: string): Set<string> {
  const platforms: Array<[RegExp, string]> = [
    [/\b(?:playstation\s*2|ps2)\b/i, "ps2"], [/\b(?:playstation\s*3|ps3)\b/i, "ps3"],
    [/\b(?:playstation\s*4|ps4)\b/i, "ps4"], [/\b(?:playstation\s*5|ps5)\b/i, "ps5"],
    [/\b(?:nintendo\s*)?wii\s*u\b/i, "wiiu"], [/\b(?:nintendo\s*)?wii\b(?!\s*u)/i, "wii"],
    [/\b(?:nintendo\s*)?switch\b/i, "switch"], [/\b(?:nintendo\s*)?3ds\b/i, "3ds"],
    [/\b(?:nintendo\s*)?ds\b/i, "ds"], [/\bxbox\s*360\b/i, "xbox360"],
    [/\bxbox\s*one\b/i, "xboxone"], [/\bxbox\s*series(?:\s*[xs])?\b/i, "xboxseries"],
    [/\bgame\s*boy\s*advance\b|\bgba\b/i, "gba"], [/\bgame\s*boy\s*color\b|\bgbc\b/i, "gbc"],
    [/\bgame\s*boy\b/i, "gameboy"], [/\b(?:pc|windows|amstrad\s+cpc)\b/i, "pc"],
    [/\b(?:super\s+nintendo|snes)\b/i, "snes"], [/\b(?:nintendo\s*64|n64)\b/i, "n64"],
  ];
  return new Set(platforms.filter(([pattern]) => pattern.test(value)).map(([, platform]) => platform));
}

function rejectionReason(bundle: PhysicalEvidenceBundleV1): string | null {
  const haystack = normalized(`${bundle.listing.title} ${bundle.listing.description ?? ""}`);
  const vision = bundle.observations.flatMap((row) => row.textSnippets).join(" ");
  if (/\b(fridge magnet|iman(?:es)? nevera|vhs|manga|comic|tapa blanda|poster|amiibo|vinyl)\b/.test(haystack)
    || /^\s*(?:figura|figure)\b/.test(haystack) || /\b7\s*''/.test(haystack)) return "non_game_product";
  if (/\b(solo manual|manual only)\b/.test(haystack) || /^\s*manual\b/.test(haystack)) return "manual_only";
  if (/\b(solo caja|box only|empty box)\b/.test(haystack)) return "box_only";
  const expected = canonicalPlatform(bundle.subject.platform);
  const observed = observedPlatforms(haystack);
  if (expected && observed.size > 0 && !observed.has(expected)) return "wrong_platform";
  if (bundle.rejected.includes("identity") || bundle.conflicts.some((value) => /wrong_game|wrong_platform|wrong_edition/i.test(value))) return "subject_conflict";
  if (/non.game|wrong.game|wrong.platform|wrong.edition/i.test(vision)) return "subject_conflict";
  return null;
}

function completeIsPhysicallySupported(bundle: PhysicalEvidenceBundleV1): boolean {
  if (bundle.condition.bucket !== "complete") return true;
  const components = new Set(bundle.observations.map((row) => row.productNodeType));
  const hasMedia = components.has("MEDIA");
  const hasPackage = components.has("OUTER_PACKAGE") || components.has("INNER_PRODUCT");
  const manualOkay = bundle.condition.manualExpected === false || bundle.observations.some((row) => row.productNodeType === "DOCUMENT" && /manual/i.test(row.component));
  return hasMedia && hasPackage && manualOkay;
}

function conditionIsPhysicallySupported(bundle: PhysicalEvidenceBundleV1): boolean {
  if (bundle.condition.bucket === "unknown") return false;
  if (bundle.condition.bucket === "complete") return completeIsPhysicallySupported(bundle);
  if (bundle.condition.bucket === "sealed") {
    return bundle.observations.some((row) => row.productNodeType === "STICKER" && row.role === "seal");
  }
  return true;
}

export function resolveReviewBundle(bundle: PhysicalEvidenceBundleV1, options: { catalogIds: Set<string>; gitSha?: string; runId?: string; now?: string } ): CuratorResolution {
  validatePhysicalEvidenceBundle(bundle);
  const now = options.now ?? new Date().toISOString();
  const runId = options.runId ?? randomUUID();
  const reject = rejectionReason(bundle);
  const candidate = bundle.catalog.candidateCatalogId;
  const candidateExists = Boolean(candidate && options.catalogIds.has(candidate));
  const exactIdentity = bundle.confirmed.includes("identity");
  const safeCondition = conditionIsPhysicallySupported(bundle);
  const marketBound = bundle.regional.marketBinding === "MARKET_BOUND";
  const targetSame = normalized(bundle.regional.targetRegion) === normalized(bundle.regional.detectedRegion);
  let decision: CuratorDecisionKind = "DEFER";
  let resolvedCatalogId: string | null = null;
  let reason = "High-value evidence gaps remain; preserve the case for a later eligible attempt.";
  let confidence = 0.5;
  if (reject) {
    decision = "REJECT"; reason = reject; confidence = 0.99;
  } else if (candidateExists && exactIdentity && safeCondition && marketBound && targetSame) {
    decision = "ACCEPT_EXISTING"; resolvedCatalogId = candidate; reason = "Identity, market and visible condition are bound to the existing catalog entry."; confidence = Math.max(0.9, bundle.confidence ?? 0);
  } else if (candidateExists && exactIdentity && safeCondition && marketBound && !targetSame) {
    const alternative = bundle.catalog.alternatives.find((row) => typeof row.catalogId === "string" && options.catalogIds.has(row.catalogId) && normalized(String(row.region ?? "")) === normalized(bundle.regional.detectedRegion));
    if (alternative?.catalogId) { decision = "REROUTE_EXISTING"; resolvedCatalogId = String(alternative.catalogId); reason = "Market-bound evidence identifies a different existing regional variant."; confidence = Math.max(0.9, bundle.confidence ?? 0); }
  } else if (!candidateExists && exactIdentity && safeCondition && marketBound) {
    decision = "PROPOSE_NEW_VARIANT"; reason = "Bound evidence supports a physical/regional variant absent from the current catalog; proposal only."; confidence = Math.max(0.85, bundle.confidence ?? 0);
  } else if (bundle.regional.marketBinding === "LANGUAGE_ONLY") {
    reason = "Packaging language is not market proof; MARKET_BOUND evidence is still required.";
  } else if (bundle.condition.bucket === "complete" && !completeIsPhysicallySupported(bundle)) {
    reason = "Complete cannot be preserved without visible edition contents.";
  }
  return {
    reviewItemId: bundle.reviewItemId, runId, decision, resolvedCatalogId,
    previousCatalogId: bundle.catalog.searchedCatalogId, inputHash: bundle.inputHash, evidenceHash: bundle.evidenceHash,
    researchEngineVersion: CURATOR_ENGINE_VERSION, gitSha: options.gitSha ?? "unknown", reason, confidence,
    sources: [bundle.source], evidenceIds: bundle.observations.map((row) => row.id), imagesUsed: [...new Set(bundle.observations.map((row) => row.imageIndex))], identifiersUsed: bundle.identifiers.map((row) => row.value),
    evidenceGaps: bundle.evidenceGaps.map((gap) => gap.code), braveCalls: 0, openAiCalls: 0, costUsd: 0, createdAt: now, resolvedAt: now,
  };
}

export function priceObservationFromResolution(bundle: PhysicalEvidenceBundleV1, resolution: CuratorResolution): Record<string, unknown> {
  if (!["ACCEPT_EXISTING", "REROUTE_EXISTING"].includes(resolution.decision) || !resolution.resolvedCatalogId) throw new Error("Only accepted existing-catalog decisions can re-enter price ingestion.");
  return {
    catalogId: resolution.resolvedCatalogId, source: bundle.source, listingType: "active", priceEur: bundle.price.amount,
    title: bundle.listing.title, productUrl: bundle.listing.url, externalId: bundle.listing.id,
    listingRegion: bundle.regional.detectedRegion, regionVerified: true, regionEvidence: bundle.regional.evidence,
    condition: bundle.condition.bucket, humanReviewed: false, curatorResolved: true,
    curatorRunId: resolution.runId, curatorEvidenceHash: bundle.evidenceHash,
  };
}

export function queueStatusForDecision(decision: CuratorDecisionKind): QueueCuratorStatus {
  return ({ ACCEPT_EXISTING: "accepted", REROUTE_EXISTING: "rerouted", REJECT: "rejected", DEFER: "deferred", NEEDS_HUMAN: "deferred", PROPOSE_NEW_VARIANT: "proposed_variant" } as const)[decision];
}

export function assertFreshReviewInput(authoritative: Record<string, unknown>, bundle: PhysicalEvidenceBundleV1): void {
  if (authoritative.id !== bundle.reviewItemId || !["pending", "deferred"].includes(String(authoritative.status))) throw new Error("STALE_REVIEW_INPUT");
  const fresh = physicalEvidenceBundleFromReviewItem(authoritative, bundle.queueVersion);
  if (fresh.inputHash !== bundle.inputHash || fresh.evidenceHash !== bundle.evidenceHash) throw new Error("STALE_REVIEW_INPUT");
}

export type CuratorQueueDocument = {
  schemaVersion?: number;
  updatedAt?: string;
  items: Array<Record<string, unknown>>;
  decisions: Array<Record<string, unknown>>;
};

export function applyResolutionToQueueDocument(
  queue: CuratorQueueDocument,
  bundle: PhysicalEvidenceBundleV1,
  resolution: CuratorResolution,
  now = new Date().toISOString(),
): { applied: boolean; stale: boolean; priceObservation: Record<string, unknown> | null } {
  const eventKey = `${resolution.reviewItemId}:${resolution.inputHash}:${resolution.decision}`;
  if (queue.decisions.some((event) => `${event.reviewItemId ?? event.id}:${event.inputHash ?? ""}:${event.decision ?? event.action}` === eventKey)) {
    return { applied: false, stale: false, priceObservation: null };
  }
  const index = queue.items.findIndex((item) => item.id === resolution.reviewItemId);
  if (index < 0) return { applied: false, stale: true, priceObservation: null };
  try { assertFreshReviewInput(queue.items[index], bundle); } catch { return { applied: false, stale: true, priceObservation: null }; }
  const previous = queue.items[index];
  const status = queueStatusForDecision(resolution.decision);
  queue.items[index] = {
    ...previous, status, updatedAt: now, decidedAt: status === "deferred" ? previous.decidedAt : now,
    curatorResolution: resolution,
    ...(status === "deferred" ? {
      attemptCount: Number(previous.attemptCount ?? 0) + 1,
      lastAttemptAt: now,
      nextEligibleAt: new Date(Date.parse(now) + Math.min(30, 2 ** Number(previous.attemptCount ?? 0)) * 86_400_000).toISOString(),
    } : {}),
  };
  queue.decisions.unshift({ at: now, ...resolution });
  queue.updatedAt = now;
  return {
    applied: true,
    stale: false,
    priceObservation: ["ACCEPT_EXISTING", "REROUTE_EXISTING"].includes(resolution.decision)
      ? priceObservationFromResolution(bundle, resolution) : null,
  };
}
