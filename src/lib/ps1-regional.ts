export type RegionalEvidence = {
  value?: unknown;
  source: string;
  sourceUrl: string;
  verifiedAt: string;
  confidence: "high" | "documented" | "unresolved";
  scope?: string;
};

export type Ps1GraphicReference = {
  assetId: string;
  roles: string[];
  sourceUrl: string;
  sourceImageReference: string;
  label: string | null;
  group: string | null;
  marketHints: string[];
  physicalPairingVerified: boolean;
  stored: boolean;
  url?: string;
  sha256?: string;
  width?: number;
  height?: number;
  thumbnailOnly?: boolean;
};

export type Ps1EditionDetails = {
  schemaVersion: 2;
  status: "resolved" | "review";
  releaseId: string | null;
  workId: string | null;
  identityScope: "regional_software_release" | "regional_physical_edition";
  serialScope?: "disc" | "packaging";
  softwareCategory?: string[];
  containsMultipleWorks?: boolean;
  physicalVariantResolved: boolean;
  legacyRegion?: string | null;
  legacyReference?: string | null;
  reviewReasons: string[];
  matchMethod: string | null;
  sources: Array<{ label: string; url: string; sha256?: string }>;
  fieldProvenance: Record<string, RegionalEvidence | RegionalEvidence[]>;
  languages?: {
    all: string[];
    text: string[];
    audio: string[];
    index: string[];
    discrepancy: boolean;
    claims: RegionalEvidence[];
  };
  editionLabels?: string[];
  sourceWarnings?: string[];
  regionalReleaseDate?: { raw: string; iso: string | null; precision: string; independentlyVerified: boolean };
  softwareMetadata?: Record<string, string>;
  graphics: Ps1GraphicReference[];
  serialAliases: Array<RegionalEvidence & { sourceSerial: string; canonicalSerial: string; relation: string; physicalVariantResolved?: boolean }>;
  components: Array<{ kind: "disc" | "back_cover"; number: number; serial: string; sourceUrl: string; title?: string; numberSource?: string }>;
  coverStatus?: string;
};

export const LANGUAGE_NAMES: Record<string, string> = {
  es: "Español", en: "Inglés", fr: "Francés", de: "Alemán", it: "Italiano",
  pt: "Portugués", nl: "Neerlandés", sv: "Sueco", da: "Danés", fi: "Finés",
  no: "Noruego", ja: "Japonés", ko: "Coreano", zh: "Chino", ru: "Ruso",
  el: "Griego", ar: "Árabe", pl: "Polaco",
};

export function languageNames(languages: readonly string[]): string {
  return languages.map((code) => LANGUAGE_NAMES[code] ?? code.toUpperCase()).join(" · ");
}

export function languageSummary(languages: readonly string[]): string {
  const unique = [...new Set(languages)];
  return unique.length > 1
    ? `${unique.map((code) => code.toUpperCase()).join(" · ")} · Multi-${unique.length}`
    : languageNames(unique);
}

/** Normalize typography, retaining revision/label suffixes and leading zeros. */
export function normalizePs1Serial(value: string): string {
  return value.trim().toUpperCase().replace(/^(S[A-Z]{3}|LSP)[-_. ]?(?=\d)/, "$1-");
}

const MARKET_SOURCE_RANK: Record<string, number> = {
  "redump-org": 5, "redump-info": 5, serialstation: 4,
  "verified-physical": 3, "psxdatacenter-explicit-market": 2,
};

/** Language claims can enrich text/audio fields; they can never set a market. */
export function mergePs1MarketEvidence(
  existing: RegionalEvidence | undefined,
  incoming: RegionalEvidence & { evidenceKind: "explicit-market" | "language" },
): RegionalEvidence | undefined {
  if (incoming.evidenceKind !== "explicit-market") return existing;
  if (!existing) return incoming;
  const oldRank = MARKET_SOURCE_RANK[existing.source] ?? 0;
  const newRank = MARKET_SOURCE_RANK[incoming.source] ?? 0;
  // Equally ranked contradictory claims require review, not last-write wins.
  return newRank > oldRank ? incoming : existing;
}

export type Ps1SerialCandidate = {
  id: string;
  canonicalSerials?: string[];
  resolutionSerials?: string[];
  regionalStatus?: "resolved" | "review";
};

export function resolvePs1Serial<T extends Ps1SerialCandidate>(
  games: readonly T[], value: string,
): { candidates: T[]; physicalVariantResolved: false } {
  const query = normalizePs1Serial(value);
  const candidates = games.filter((game) => game.regionalStatus === "resolved" &&
    [...(game.canonicalSerials ?? []), ...(game.resolutionSerials ?? [])].some((code) => normalizePs1Serial(code) === query));
  return { candidates, physicalVariantResolved: false };
}
