import { createHash } from "node:crypto";
import { assertSafeResearchUrl } from "./url-security";
import type {
  ResearchBindingState,
  ResearchComponent,
  ResearchEvidenceGap,
  ResearchEvidenceGapType,
  ResearchEditionClass,
  ResearchIdentifierBinding,
  ResearchImageCandidate,
  ResearchMarketBindingState,
  ResearchProductNode,
  ResearchProductNodeType,
  ResearchProductRelation,
  ResearchSubjectClass,
  ResearchTargetField,
  ResearchVisionResult,
} from "./v2-types";

const LEGACY_COMPONENT_MAP: Partial<Record<ResearchComponent, ResearchComponent>> = {
  FRONT: "OUTER_PACKAGE_FRONT",
  BACK: "OUTER_PACKAGE_BACK",
  SPINE: "OUTER_PACKAGE_SPINE",
  BOX_FRONT: "OUTER_PACKAGE_FRONT",
  BOX_BACK: "OUTER_PACKAGE_BACK",
  BOX_SPINE: "OUTER_PACKAGE_SPINE",
  BOX_FLAPS: "OUTER_PACKAGE_FLAP",
  CART_FRONT: "CARTRIDGE_FRONT",
  CART_BACK: "CARTRIDGE_BACK",
  MANUAL: "MANUAL_FRONT",
  OUTER_BOX: "OUTER_PACKAGE_FRONT",
  INNER_BOX: "INNER_CASE_FRONT",
  UNKNOWN: "UNKNOWN_COMPONENT",
};

export function canonicalResearchComponent(component: ResearchComponent): ResearchComponent {
  return LEGACY_COMPONENT_MAP[component] ?? component;
}

export function canonicalImageUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.toString();
  } catch {
    return value;
  }
}

export function imageCandidateKey(candidate: Pick<ResearchImageCandidate, "canonicalUrl" | "resolvedUrl">): string {
  return canonicalImageUrl(candidate.canonicalUrl || candidate.resolvedUrl);
}

export function imageContentHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function fetchImageContentHash(value: string, options: { fetchImpl?: typeof fetch; maxBytes?: number; timeoutMs?: number } = {}): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
  try {
    const safe = await assertSafeResearchUrl(value);
    const response = await (options.fetchImpl ?? fetch)(safe, { signal: controller.signal, redirect: "follow" });
    if (!response.ok) return null;
    const declared = Number(response.headers.get("content-length") ?? 0);
    const maxBytes = options.maxBytes ?? 15_000_000;
    if (declared > maxBytes) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.length && bytes.length <= maxBytes ? imageContentHash(bytes) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function sourceRecordIdFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.pathname.match(/~x(\d+)(?:$|\/)/i)?.[1]
      ?? url.pathname.match(/\/games\/(?:images\/)?(\d+)(?:-|--|\/|$)/i)?.[1]
      ?? url.pathname.match(/\/(\d{5,})(?:\/)?$/)?.[1]
      ?? null;
  } catch {
    return null;
  }
}

export function classifyEvidenceGap(field: ResearchTargetField, candidateValue: unknown): ResearchEvidenceGapType {
  switch (field) {
    case "BARCODE": return "MISSING_BARCODE_PHOTO";
    case "BOX_CODE": return "MISSING_BACK_COVER";
    case "PRODUCT_CODE":
    case "MEDIA_ID":
    case "ROM_REVISION": return "MISSING_CART_PHOTO";
    case "PHYSICAL_PRODUCT_TYPE": return "MISSING_DOWNLOAD_STATEMENT";
    case "OUTER_INNER_RELATION": return candidateValue ? "MISSING_COMPONENT_BINDING" : "MISSING_OUTER_BOX_PHOTO";
    case "MARKET_REGION":
    case "EVIDENCE_MARKET":
    case "DISTRIBUTION_MARKET": return "MISSING_MARKET_PROOF";
    case "CANONICAL_IDENTITY": return "MISSING_EDITION_PROOF";
    default: return candidateValue ? "MISSING_SECOND_SOURCE" : "MISSING_COMPONENT_BINDING";
  }
}

const GAP_ACTIONS: Record<ResearchEvidenceGapType, string[]> = {
  MISSING_BACK_COVER: ["OPEN_EXISTING_GALLERIES", "RESOLVE_ORIGINAL_IMAGE", "SEARCH_EXACT_BACK_COVER"],
  MISSING_BARCODE_PHOTO: ["OPEN_EXISTING_GALLERIES", "RESOLVE_ORIGINAL_IMAGE", "SEARCH_EXACT_BARCODE_PHOTO"],
  MISSING_CART_PHOTO: ["OPEN_EXISTING_GALLERIES", "SEARCH_EXACT_CART_PHOTO", "SEARCH_PHYSICAL_UNBOXING"],
  MISSING_OUTER_BOX_PHOTO: ["OPEN_EXISTING_GALLERIES", "SEARCH_EXACT_OUTER_PACKAGE", "SEARCH_SPECIFIC_LISTING"],
  MISSING_INNER_BOX_PHOTO: ["OPEN_EXISTING_GALLERIES", "SEARCH_EXACT_INNER_CASE", "SEARCH_PHYSICAL_UNBOXING"],
  MISSING_MANUAL_PHOTO: ["OPEN_EXISTING_GALLERIES", "SEARCH_EXACT_MANUAL", "SEARCH_PHYSICAL_UNBOXING"],
  MISSING_DOWNLOAD_STATEMENT: ["OPEN_EXISTING_GALLERIES", "SEARCH_EXACT_BACK_COVER", "SEARCH_PHYSICAL_UNBOXING"],
  MISSING_MARKET_PROOF: ["INSPECT_LEGAL_TEXT", "INSPECT_DISTRIBUTOR_TEXT", "SEARCH_EXACT_MARKET_PACKAGE"],
  MISSING_EDITION_PROOF: ["OPEN_EXISTING_GALLERIES", "INSPECT_EDITION_MARKERS", "SEARCH_EXACT_EDITION_PACKAGE"],
  MISSING_COMPONENT_BINDING: ["CLASSIFY_PRODUCT_ROLE", "CLASSIFY_COMPONENT", "BIND_IDENTIFIER_TO_NODE"],
  MISSING_SECOND_SOURCE: ["VERIFY_IDENTIFIER", "SEARCH_SECOND_INDEPENDENT_SOURCE"],
};

export function createEvidenceGap(input: {
  field: ResearchTargetField;
  candidateValue: unknown;
  missingProof: string;
  recommendedSourceTypes: string[];
  exhaustedActions?: string[];
}): ResearchEvidenceGap {
  const type = classifyEvidenceGap(input.field, input.candidateValue);
  return {
    field: input.field,
    type,
    candidateValue: input.candidateValue,
    missingProof: input.missingProof,
    recommendedActions: GAP_ACTIONS[type],
    recommendedSourceTypes: input.recommendedSourceTypes,
    exhaustedActions: input.exhaustedActions ?? [],
  };
}

export function isPhysicalEvidenceGap(gap: ResearchEvidenceGap): boolean {
  return gap.type !== "MISSING_SECOND_SOURCE";
}

function nodeId(label: string, type: ResearchProductNodeType, component: ResearchComponent | null): string {
  return createHash("sha256").update(`${type}|${label}|${component ?? ""}`).digest("hex").slice(0, 20);
}

export function createProductNode(input: {
  label: string;
  type: ResearchProductNodeType;
  component?: ResearchComponent | null;
  parentProductId?: string | null;
}): ResearchProductNode {
  const component = input.component ? canonicalResearchComponent(input.component) : null;
  return {
    id: nodeId(input.label, input.type, component),
    type: input.type,
    label: input.label,
    parentProductId: input.parentProductId ?? null,
    component,
  };
}

export function mergeProductGraph(input: {
  nodes: ResearchProductNode[];
  relations: ResearchProductRelation[];
  nextNodes?: ResearchProductNode[];
  nextRelations?: ResearchProductRelation[];
}): { nodes: ResearchProductNode[]; relations: ResearchProductRelation[] } {
  const nodes = [...new Map([...(input.nodes ?? []), ...(input.nextNodes ?? [])].map((row) => [row.id, row])).values()];
  const validIds = new Set(nodes.map((row) => row.id));
  const relations = [...new Map([...(input.relations ?? []), ...(input.nextRelations ?? [])]
    .filter((row) => validIds.has(row.fromNodeId) && validIds.has(row.toNodeId) && row.fromNodeId !== row.toNodeId)
    .map((row) => [`${row.fromNodeId}:${row.relation}:${row.toNodeId}`, row])).values()];
  return { nodes, relations };
}

export function subjectAccepted(subjectClass: ResearchSubjectClass): boolean {
  return subjectClass === "EXACT_PRODUCT";
}

const EDITION_MARKER_REQUIRED = /\b(?:skull|buccaneer|black chest|collector|special|double pack)\b/i;

export function enforceExpectedEditionSubjectClass(input: {
  subjectClass: ResearchSubjectClass;
  expectedEdition: string | null | undefined;
  editionClass: ResearchEditionClass;
  visibleEditionMarker: string | null;
}): ResearchSubjectClass {
  if (input.subjectClass !== "EXACT_PRODUCT" || !EDITION_MARKER_REQUIRED.test(input.expectedEdition ?? "")) return input.subjectClass;
  if (input.editionClass !== "EXPECTED_EDITION" || !input.visibleEditionMarker?.trim()) return "SAME_TITLE_DIFFERENT_EDITION";
  return input.subjectClass;
}

export function physicalBindingState(input: {
  subjectClass: ResearchSubjectClass;
  component: ResearchComponent;
  productNodeId: string | null;
  conflicts?: boolean;
}): ResearchBindingState {
  if (input.conflicts) return "CONFLICTING";
  if (!subjectAccepted(input.subjectClass)) return input.subjectClass === "UNREADABLE" ? "UNBOUND" : "REJECTED";
  if (canonicalResearchComponent(input.component) === "UNKNOWN_COMPONENT") return "UNBOUND";
  return input.productNodeId ? "PRODUCT_BOUND" : "COMPONENT_BOUND";
}

export function marketBindingState(result: Pick<ResearchVisionResult, "packagingLanguagesObserved" | "distributorText"> & { explicitMarket?: string | null }): ResearchMarketBindingState {
  if (result.explicitMarket) return "MARKET_BOUND";
  if (result.packagingLanguagesObserved.length) return "LANGUAGE_ONLY";
  return "UNBOUND";
}

export function identifierBinding(input: {
  identifierType: string;
  value: string;
  component: ResearchComponent | null;
  productNodeId: string | null;
  componentNodeId: string | null;
  evidenceId: string;
  subjectClass: ResearchSubjectClass;
  conflicts?: boolean;
}): ResearchIdentifierBinding {
  const state = physicalBindingState({
    subjectClass: input.subjectClass,
    component: input.component ?? "UNKNOWN_COMPONENT",
    productNodeId: input.productNodeId,
    conflicts: input.conflicts,
  });
  return {
    identifierType: input.identifierType,
    value: input.value,
    productNodeId: input.productNodeId,
    componentNodeId: input.componentNodeId,
    component: input.component ? canonicalResearchComponent(input.component) : null,
    state,
    sourceEvidenceIds: [input.evidenceId],
    rejectionReason: state === "REJECTED" ? `Subject classification ${input.subjectClass}` : null,
  };
}

export function genericQueriesAllowedAfterPhysicalMode(queryStrategies: string[], limit = 2): boolean {
  return queryStrategies.filter((strategy) => strategy === "GENERIC").length < limit;
}
