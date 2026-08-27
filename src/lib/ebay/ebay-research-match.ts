import { hasBlockedAffiliateKeyword } from "../affiliate/matching/score-offer-match.ts";
import { normalizeAffiliateText, titleTokens } from "../affiliate/matching/normalize-title.ts";
import type { EbayLocalizedAspect } from "./ebay.types.ts";

export type EbaySearchBasis = {
  kind: "gtin" | "epid" | "keyword";
  value: string;
};

export type EbayResearchTarget = {
  title: string;
  platformSlug: string;
  region: string;
  gtins: string[];
  epids?: string[];
  reference?: string | null;
};

export type EbayResearchEvidence = {
  title: string;
  productTitle?: string | null;
  gtin?: string | null;
  epid?: string | null;
  condition?: string | null;
  conditionId?: string | null;
  localizedAspects?: EbayLocalizedAspect[];
  searchBasis: EbaySearchBasis;
};

export type EbayRegionMatch = "exact" | "compatible" | "identifier" | "unknown" | "conflict";
export type EbayPlatformMatch = "exact" | "unknown" | "conflict";
export type EbayResearchDecision = "accept" | "review" | "other_variant" | "reject";
export type EbayConditionBucket = "loose" | "game_manual" | "complete" | "sealed" | "unknown";

export type EbayResearchMatch = {
  decision: EbayResearchDecision;
  confidence: number;
  titleCoverage: number;
  exactIdentifier: boolean;
  exactReference: boolean;
  platformMatch: EbayPlatformMatch;
  regionMatch: EbayRegionMatch;
  regionEvidence: string[];
  suggestedRegion: string | null;
  conditionBucket: EbayConditionBucket;
  reasons: string[];
};

type PlatformMarker = { slug: string; patterns: RegExp[] };

const PLATFORM_MARKERS: PlatformMarker[] = [
  { slug: "switch2", patterns: [/\bnintendo switch 2\b/, /\bswitch 2\b/] },
  { slug: "switch", patterns: [/\bnintendo switch\b(?! 2)/, /\bswitch\b(?! 2)/] },
  { slug: "ps5", patterns: [/\bps5\b/, /\bplaystation 5\b/] },
  { slug: "ps4", patterns: [/\bps4\b/, /\bplaystation 4\b/] },
  { slug: "ps3", patterns: [/\bps3\b/, /\bplaystation 3\b/] },
  { slug: "ps2", patterns: [/\bps2\b/, /\bplaystation 2\b/] },
  { slug: "psvita", patterns: [/\bps vita\b/, /\bplaystation vita\b/] },
  { slug: "psp", patterns: [/\bpsp\b/, /\bplaystation portable\b/] },
  { slug: "ps1", patterns: [/\bps1\b/, /\bplaystation 1\b/, /\bsony playstation\b(?! [2345])/] },
  { slug: "xboxseries", patterns: [/\bxbox series (?:x|s|x s)\b/] },
  { slug: "xboxone", patterns: [/\bxbox one\b/] },
  { slug: "xbox360", patterns: [/\bxbox 360\b/] },
  { slug: "xbox", patterns: [/\bxbox\b(?! (?:one|360|series))/] },
  { slug: "3ds", patterns: [/\bnintendo 3ds\b/, /\b3ds\b/] },
  { slug: "ds", patterns: [/\bnintendo ds\b/, /\bnds\b/] },
  { slug: "wiiu", patterns: [/\bnintendo wii u\b/, /\bwii u\b/] },
  { slug: "wii", patterns: [/\bnintendo wii\b(?! u)/, /\bwii\b(?! u)/] },
  { slug: "gamecube", patterns: [/\bgamecube\b/, /\bnintendo gamecube\b/] },
  { slug: "gba", patterns: [/\bgame boy advance\b/, /\bgba\b/] },
  { slug: "gameboy", patterns: [/\bnintendo game boy\b(?! (?:color|advance))/, /\bgameboy\b(?! (?:color|advance))/, /\bdmg\b/] },
  { slug: "n64", patterns: [/\bn64\b/, /\bnintendo 64\b/] },
  { slug: "snes", patterns: [/\bsnes\b/, /\bsuper nintendo\b/] },
  { slug: "nes", patterns: [/\bnes\b/, /\bnintendo entertainment system\b/] },
  { slug: "dreamcast", patterns: [/\bdreamcast\b/] },
  { slug: "saturn", patterns: [/\bsega saturn\b/] },
  { slug: "megacd", patterns: [/\bmega cd\b/, /\bsega cd\b/] },
  { slug: "sega32x", patterns: [/\bsega 32x\b/, /\b32x\b/] },
  { slug: "megadrive", patterns: [/\bmega drive\b/, /\bsega genesis\b/, /\bgenesis\b/] },
  { slug: "mastersystem", patterns: [/\bmaster system\b/] },
  { slug: "gamegear", patterns: [/\bgame gear\b/] },
  { slug: "neogeopocket", patterns: [/\bneo geo pocket(?: color)?\b/] },
  { slug: "neogeocd", patterns: [/\bneo geo cd\b/] },
  { slug: "neogeo", patterns: [/\bneo geo(?: aes)?\b(?! (?:cd|pocket))/] },
];

function normalizedIdentifier(value: string | null | undefined): string {
  return (value ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function aspectText(aspects: EbayLocalizedAspect[] | undefined): string {
  return (aspects ?? [])
    .flatMap((aspect) => [aspect.localizedName ?? "", ...(aspect.localizedValues ?? [])])
    .join(" ");
}

function evidenceText(evidence: EbayResearchEvidence): string {
  return normalizeAffiliateText(
    [evidence.title, evidence.productTitle, evidence.condition, aspectText(evidence.localizedAspects)]
      .filter(Boolean)
      .join(" "),
  );
}

function detectedPlatforms(text: string): Set<string> {
  const detected = new Set<string>();
  for (const marker of PLATFORM_MARKERS) {
    if (marker.patterns.some((pattern) => pattern.test(text))) detected.add(marker.slug);
  }
  return detected;
}

function platformMatch(text: string, expectedSlug: string): EbayPlatformMatch {
  const detected = detectedPlatforms(text);
  if (detected.has(expectedSlug)) return "exact";
  return detected.size > 0 ? "conflict" : "unknown";
}

type RegionSignal = "spain" | "europe" | "uk" | "germany" | "usa" | "japan" | "australia";

function regionSignals(text: string): Set<RegionSignal> {
  const signals = new Set<RegionSignal>();
  if (/\bpal (?:esp|es)\b|\bespana\b|\bspain\b|\bspanish version\b|\bedicion espanola\b/.test(text)) signals.add("spain");
  if (/\bpal (?:eur|europe|europa)\b|\beuropean version\b|\bversion europea\b/.test(text)) signals.add("europe");
  if (/\bpal uk\b|\buk version\b|\bbritish version\b/.test(text)) signals.add("uk");
  if (/\bpal (?:de|ger)\b|\bgerman version\b|\bdeutsch\b|\busk\b/.test(text)) signals.add("germany");
  if (/\bntsc u\b|\bntsc usa\b|\busa\b|\bunited states\b|\bnorth american\b|\besrb\b/.test(text)) signals.add("usa");
  if (/\bntsc j\b|\bjapan\b|\bjapanese\b|\bjapon\b|\bcero\b/.test(text)) signals.add("japan");
  if (/\bpal aus\b|\baustralia\b|\baustralian\b/.test(text)) signals.add("australia");
  if (/\bpal\b/.test(text) && !["usa", "japan", "australia"].some((signal) => signals.has(signal as RegionSignal))) {
    signals.add("europe");
  }
  return signals;
}

function targetRegionKind(region: string): RegionSignal | "pal-europe" | "unknown" {
  const normalized = normalizeAffiliateText(region);
  if (normalized.includes("espana")) return "spain";
  if (normalized.includes("alemania") || normalized.includes("germany")) return "germany";
  if (normalized.includes("uk") || normalized.includes("eng")) return "uk";
  if (normalized.includes("australia")) return "australia";
  if (normalized.includes("usa") || normalized.includes("ntsc u")) return "usa";
  if (normalized.includes("japon") || normalized.includes("japan") || normalized.includes("ntsc j")) return "japan";
  if (normalized.includes("pal") || normalized.includes("europa")) return "pal-europe";
  return "unknown";
}

function suggestedRegion(evidence: string[]): string | null {
  if (evidence.includes("spain")) return "PAL España";
  if (evidence.includes("uk")) return "PAL UK";
  if (evidence.includes("germany")) return "PAL Alemania";
  if (evidence.includes("usa")) return "USA";
  if (evidence.includes("japan")) return "Japón";
  if (evidence.includes("australia")) return "Australia";
  if (evidence.includes("europe")) return "PAL Europa";
  return null;
}

function evaluateRegion(
  text: string,
  targetRegion: string,
  identifierMatched: boolean,
): { match: EbayRegionMatch; evidence: string[] } {
  const signals = regionSignals(text);
  const evidence = [...signals];
  const target = targetRegionKind(targetRegion);
  if (signals.size === 0) {
    return { match: identifierMatched ? "identifier" : "unknown", evidence };
  }

  const palSignals = new Set<RegionSignal>(["spain", "europe", "uk", "germany"]);
  const hasPal = [...signals].some((signal) => palSignals.has(signal));
  const hasNonPal = signals.has("usa") || signals.has("japan") || signals.has("australia");
  if (hasPal && hasNonPal) return { match: "conflict", evidence };

  if (target === "spain") {
    if (signals.has("spain")) return { match: "exact", evidence };
    return { match: hasPal ? "unknown" : "conflict", evidence };
  }
  if (target === "pal-europe") {
    return { match: hasPal ? "compatible" : "conflict", evidence };
  }
  if (target === "germany" || target === "uk") {
    if (signals.has(target)) return { match: "exact", evidence };
    return { match: hasPal ? "unknown" : "conflict", evidence };
  }
  if (target === "usa" || target === "japan" || target === "australia") {
    return { match: signals.has(target) ? "exact" : "conflict", evidence };
  }
  return { match: identifierMatched ? "identifier" : "unknown", evidence };
}

function titleCoverage(targetTitle: string, candidateTitle: string): number {
  const compactTarget = normalizeAffiliateText(targetTitle).replace(/\s+/g, "");
  const compactCandidate = normalizeAffiliateText(candidateTitle).replace(/\s+/g, "");
  if (compactTarget.length >= 5 && compactCandidate.includes(compactTarget)) return 1;
  const expected = titleTokens(targetTitle);
  if (expected.length === 0) return 0;
  const candidate = new Set(titleTokens(candidateTitle));
  const matched = expected.filter((token) => candidate.has(token)).length;
  return Math.round((matched / expected.length) * 100) / 100;
}

function inferConditionBucket(evidence: EbayResearchEvidence, text: string): EbayConditionBucket {
  const condition = normalizeAffiliateText(evidence.condition ?? "");
  if (/\bsealed\b|\bprecintad[oa]\b|\bfactory sealed\b/.test(text)) return "sealed";
  if (/\bnew\b|\bnuevo\b/.test(condition) && !/\bopen box\b|\bcaja abierta\b/.test(text)) return "sealed";
  if (/\bgame (?:and|with) manual\b|\bjuego (?:y|con) manual\b|\bdisc (?:and|with) manual\b/.test(text) && !/\bwith box\b|\bcon caja\b/.test(text)) {
    return "game_manual";
  }
  if (/\bcib\b|\bcomplete\b|\bcompleto\b|\bwith box(?: and manual)?\b|\bcon caja(?: y manual)?\b|\bboxed\b/.test(text)) {
    return "complete";
  }
  if (/\bloose\b|\bsolo (?:cartucho|disco|juego)\b|\bcartridge only\b|\bdisc only\b|\bgame only\b/.test(text)) {
    return "loose";
  }
  return "unknown";
}

function roundConfidence(value: number): number {
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

export function evaluateEbayResearchMatch(
  target: EbayResearchTarget,
  evidence: EbayResearchEvidence,
): EbayResearchMatch {
  const text = evidenceText(evidence);
  const coverage = titleCoverage(target.title, evidence.productTitle || evidence.title);
  const targetGtins = new Set(target.gtins.map(normalizedIdentifier).filter(Boolean));
  const evidenceGtin = normalizedIdentifier(evidence.gtin);
  const basisGtin = evidence.searchBasis.kind === "gtin" ? normalizedIdentifier(evidence.searchBasis.value) : "";
  const targetEpids = new Set((target.epids ?? []).map(normalizedIdentifier).filter(Boolean));
  const evidenceEpid = normalizedIdentifier(evidence.epid);
  const basisEpid = evidence.searchBasis.kind === "epid" ? normalizedIdentifier(evidence.searchBasis.value) : "";
  const exactIdentifier =
    (evidenceGtin.length > 0 && targetGtins.has(evidenceGtin)) ||
    (basisGtin.length > 0 && targetGtins.has(basisGtin)) ||
    (evidenceEpid.length > 0 && targetEpids.has(evidenceEpid)) ||
    (basisEpid.length > 0 && targetEpids.has(basisEpid));
  const reference = normalizedIdentifier(target.reference);
  const exactReference = reference.length > 2 && normalizedIdentifier(text).includes(reference);
  const platform = platformMatch(text, target.platformSlug);
  const region = evaluateRegion(text, target.region, exactIdentifier || exactReference);
  const blocked = hasBlockedAffiliateKeyword(evidence.title);

  let confidence = coverage * 0.58;
  if (exactIdentifier) confidence += 0.3;
  if (exactReference) confidence += 0.22;
  if (platform === "exact") confidence += 0.16;
  if (region.match === "exact") confidence += 0.16;
  if (region.match === "compatible") confidence += 0.08;
  if (region.match === "identifier") confidence += 0.14;
  if (platform === "conflict") confidence -= 0.45;
  if (region.match === "conflict") confidence -= 0.55;
  confidence = roundConfidence(confidence);

  const reasons: string[] = [];
  if (exactIdentifier) reasons.push("EAN/GTIN exacto");
  if (exactReference) reasons.push("referencia exacta");
  reasons.push(`título ${Math.round(coverage * 100)}%`);
  reasons.push(`plataforma ${platform}`);
  reasons.push(`región ${region.match}`);
  if (blocked) reasons.push("contenido accesorio o no válido");

  let decision: EbayResearchDecision = "review";
  if (blocked || platform === "conflict" || (coverage < 0.45 && !exactIdentifier && !exactReference)) {
    decision = "reject";
  } else if (region.match === "conflict") {
    decision = "other_variant";
  } else if (
    (exactIdentifier && confidence >= 0.78) ||
    (exactIdentifier && exactReference && confidence >= 0.72) ||
    (exactReference && region.match !== "unknown" && confidence >= 0.82) ||
    (platform === "exact" && ["exact", "compatible"].includes(region.match) && confidence >= 0.84)
  ) {
    decision = "accept";
  } else if (confidence < 0.62) {
    decision = "reject";
  }

  return {
    decision,
    confidence,
    titleCoverage: coverage,
    exactIdentifier,
    exactReference,
    platformMatch: platform,
    regionMatch: region.match,
    regionEvidence: region.evidence,
    suggestedRegion: suggestedRegion(region.evidence),
    conditionBucket: inferConditionBucket(evidence, text),
    reasons,
  };
}

export function parseGameGtins(value: string | null | undefined): string[] {
  const matches = (value ?? "").match(/\b\d{8,14}\b/g) ?? [];
  return [...new Set(matches.map((entry) => entry.replace(/\D/g, "")))];
}
