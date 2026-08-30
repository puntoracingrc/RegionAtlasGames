import type {
  AiListingAnalysis,
  ListingVerificationStatus,
} from "./marketplace-types";

export const MIN_GAME_MATCH_CONFIDENCE = 0.86;
export const MIN_REGION_MATCH_CONFIDENCE = 0.75;

export type ListingVisionEvidence = {
  advertisedGameMatches: boolean | null;
  platformMatches: boolean | null;
  coverFrontVisible: boolean | null;
  coverBackVisible: boolean | null;
  sameImageRepeated: boolean | null;
  regionMatches: boolean | null;
  gameMatchConfidence: number | null;
  regionMatchConfidence: number | null;
};

export type ListingVerificationDecision = {
  status: Extract<ListingVerificationStatus, "verified" | "review_required">;
  reasons: string[];
};

export function evaluateListingVisionEvidence(
  evidence: ListingVisionEvidence,
): ListingVerificationDecision {
  const reasons: string[] = [];

  if (evidence.sameImageRepeated !== false) {
    reasons.push(
      evidence.sameImageRepeated
        ? "Las fotos parecen repetir la misma vista."
        : "No se pudo descartar que las fotos estén repetidas.",
    );
  }
  if (evidence.coverFrontVisible !== true) {
    reasons.push("No se reconoce con seguridad una portada frontal.");
  }
  if (evidence.coverBackVisible !== true) {
    reasons.push("No se reconoce con seguridad una contraportada.");
  }
  if (evidence.advertisedGameMatches !== true) {
    reasons.push("No se confirma que las fotos correspondan al juego anunciado.");
  }
  if (evidence.platformMatches !== true) {
    reasons.push("No se confirma la plataforma indicada en la ficha.");
  }
  if (
    evidence.gameMatchConfidence == null
    || evidence.gameMatchConfidence < MIN_GAME_MATCH_CONFIDENCE
  ) {
    reasons.push(
      `La confianza de identificación no alcanza el ${Math.round(MIN_GAME_MATCH_CONFIDENCE * 100)} %.`,
    );
  }
  if (evidence.regionMatches !== true) {
    reasons.push("La región no coincide o no puede comprobarse con la contraportada.");
  }
  if (
    evidence.regionMatchConfidence == null
    || evidence.regionMatchConfidence < MIN_REGION_MATCH_CONFIDENCE
  ) {
    reasons.push(
      `La confianza regional no alcanza el ${Math.round(MIN_REGION_MATCH_CONFIDENCE * 100)} %.`,
    );
  }

  return reasons.length === 0
    ? { status: "verified", reasons: [] }
    : { status: "review_required", reasons: [...new Set(reasons)] };
}

export function listingAnalysisIsVerified(
  analysis: AiListingAnalysis | null | undefined,
): boolean {
  return analysis?.verificationStatus === "verified"
    || analysis?.verificationStatus === "manual_verified";
}

export function listingAnalysisHasVerifiedEstimate(
  analysis: AiListingAnalysis | null | undefined,
): boolean {
  return analysis?.verificationStatus === "verified";
}

export function listingVerificationLabel(
  analysis: AiListingAnalysis | null | undefined,
): string {
  switch (analysis?.verificationStatus) {
    case "verified":
      return "Comprobación automática superada";
    case "manual_verified":
      return "Revisado manualmente";
    case "review_required":
      return "Necesita revisión manual";
    case "unavailable":
      return "Comprobación automática no disponible";
    case "rejected":
      return "Revisión no superada";
    default:
      return "Sin comprobar";
  }
}

export function listingNeedsManualReview(
  analysis: AiListingAnalysis | null | undefined,
): boolean {
  return analysis?.verificationStatus === "review_required"
    || analysis?.verificationStatus === "unavailable";
}
