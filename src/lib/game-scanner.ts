export const SCANNER_POLICY = "region-atlas-scanner-v1";
export const SCANNER_MAX_PHOTOS = 6;
export const SCANNER_MAX_PHOTO_BYTES = 600_000;
export const SCANNER_MAX_BODY_BYTES = 3_800_000;
export const SCANNER_MAX_HINT = 1200;
export const SCANNER_COMPONENTS = ["box", "game", "manual", "supplement", "sticker", "seal", "other"] as const;
export const SCANNER_COMPONENT_LABELS: Record<ScannerComponent, string> = {
  box: "Caja", game: "Cartucho / disco", manual: "Manual", supplement: "Suplemento",
  sticker: "Pegatina", seal: "Precinto", other: "Otro componente",
};
export type ScannerComponent = typeof SCANNER_COMPONENTS[number];
export type ScannerObservation = {
  id: string; photo: number; component: ScannerComponent; description: string;
  texts: string[]; codes: string[]; languages: string[]; distributors: string[];
};
export type ScannerPerception = {
  title: string | null; platformSlug: string | null; identityConfidence: number;
  observations: ScannerObservation[]; uncertainties: string[];
};
export type ScannerSource = { id: string; url: string; label: string; reviewedAt: string };
export type ScannerFinding = { label: string; detail: string; observationIds: string[]; sourceIds: string[] };
export type ScannerResult = {
  id: string; policy: string; model: string; analyzedAt: string; platformMatches: boolean;
  requestedModel: string; reasoningEffort: string | null; inputFingerprint: string; durationMs: number;
  usage: { requests: number; inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; cachedInputTokens: number | null };
  perception: ScannerPerception;
  region: { value: string | null; explanation: string; observationIds: string[]; sourceIds: string[] };
  composition: { status: "compatible" | "possible_mismatch" | "unknown"; explanation: string; observationIds: string[]; sourceIds: string[]; variantId: string | null };
  findings: ScannerFinding[]; nextPhotos: string[]; sources: ScannerSource[];
  knowledge: { platformGuidance: boolean; exactGameMatches: number; learningAvailable: boolean };
};

export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function scannerText(value: unknown, max = 600): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
export function scannerStrings(value: unknown, max = 12): string[] {
  return Array.isArray(value) ? [...new Set(value.map((v) => scannerText(v, 300)).filter(Boolean))].slice(0, max) : [];
}

export function normalizeScannerPerception(value: unknown, photoCount: number): ScannerPerception {
  const raw = object(value);
  const seen = new Set<string>();
  const observations: ScannerObservation[] = [];
  for (const candidate of Array.isArray(raw.observations) ? raw.observations.slice(0, 72) : []) {
    const row = object(candidate);
    if (!Number.isInteger(row.photo) || Number(row.photo) < 1 || Number(row.photo) > photoCount) continue;
    if (!SCANNER_COMPONENTS.includes(row.component as ScannerComponent)) continue;
    const observation = {
      photo: Number(row.photo), component: row.component as ScannerComponent,
      description: scannerText(row.description), texts: scannerStrings(row.texts), codes: scannerStrings(row.codes),
      languages: scannerStrings(row.languages), distributors: scannerStrings(row.distributors),
    };
    const key = JSON.stringify(observation);
    if (seen.has(key)) continue;
    seen.add(key);
    observations.push({ id: `o${observations.length + 1}`, ...observation });
  }
  const confidence = typeof raw.identityConfidence === "number" && Number.isFinite(raw.identityConfidence)
    && raw.identityConfidence >= 0 && raw.identityConfidence <= 1 ? raw.identityConfidence : 0;
  return {
    title: scannerText(raw.title, 180) || null, platformSlug: scannerText(raw.platformSlug, 40) || null,
    identityConfidence: confidence, observations, uncertainties: scannerStrings(raw.uncertainties),
  };
}

export function mergeScannerPerceptions(parts: ScannerPerception[]): ScannerPerception {
  const identityKey = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const titles = parts.map((p) => p.title).filter((v): v is string => Boolean(v));
  const platforms = [...new Set(parts.map((p) => p.platformSlug).filter(Boolean))];
  const conflicting = new Set(titles.map(identityKey)).size > 1 || platforms.length > 1;
  const identified = parts.filter((p) => p.title && p.platformSlug);
  const observations = parts.flatMap((part, index) => part.observations.map((o) => ({ ...o, photo: index + 1 })))
    .map((o, index) => ({ ...o, id: `o${index + 1}` }));
  return { title: conflicting ? null : titles[0] ?? null, platformSlug: conflicting ? null : platforms[0] ?? null,
    identityConfidence: conflicting || !identified.length ? 0 : Math.min(...identified.map((p) => p.identityConfidence)),
    observations, uncertainties: [...new Set([...parts.flatMap((p) => p.uncertainties),
      ...(conflicting ? ["Las fotos sugieren identidades diferentes. No se ha supuesto que todas las piezas pertenezcan al mismo juego."] : [])])].slice(0, 12) };
}

const REGIONS = new Set(["PAL España", "PAL Europa", "PAL Italia", "PAL Francia", "PAL Alemania", "PAL UK", "PAL Australia", "NTSC USA", "NTSC-J Japón"]);

export function normalizeScannerReasoning(value: unknown, perception: ScannerPerception, sources: ScannerSource[], platformSlug: string, knownVariantIds: string[] = []) {
  const raw = object(value);
  const platformMatches = perception.platformSlug === platformSlug;
  const validObservations = new Set(perception.observations.map((o) => o.id));
  const validSources = new Set(sources.map((s) => s.id));
  const evidence = (row: Record<string, unknown>) => ({
    observationIds: scannerStrings(row.observationIds).filter((id) => validObservations.has(id)),
    sourceIds: scannerStrings(row.sourceIds).filter((id) => validSources.has(id)),
  });
  const region = object(raw.region);
  const regionEvidence = evidence(region);
  const regionSupported = platformMatches && regionEvidence.observationIds.length > 0 && REGIONS.has(String(region.value));
  const composition = object(raw.composition);
  const compositionEvidence = evidence(composition);
  // A documented pairing needs actual components AND a documentary reference, never merely different languages.
  const components = new Set(perception.observations.filter((o) => compositionEvidence.observationIds.includes(o.id)).map((o) => o.component));
  const variantId = scannerText(composition.variantId, 200);
  const pairingSupported = platformMatches && components.size >= 2 && compositionEvidence.sourceIds.length > 0 && knownVariantIds.includes(variantId);
  const status: ScannerResult["composition"]["status"] = pairingSupported && ["compatible", "possible_mismatch"].includes(String(composition.status))
    ? composition.status as "compatible" | "possible_mismatch" : "unknown";
  const findings: ScannerFinding[] = [];
  for (const item of Array.isArray(raw.findings) ? raw.findings.slice(0, 10) : []) {
    const row = object(item);
    const refs = evidence(row);
    if (!refs.observationIds.length) continue;
    findings.push({ label: scannerText(row.label, 100), detail: scannerText(row.detail), ...refs });
  }
  return {
    platformMatches,
    region: { value: regionSupported ? String(region.value) : null,
      explanation: regionSupported ? scannerText(region.explanation) : "Región no determinada con las evidencias disponibles.", ...regionEvidence },
    composition: { status, variantId: pairingSupported ? variantId : null, explanation: status !== "unknown" ? scannerText(composition.explanation)
      : "No se puede confirmar la combinación original de estas piezas con la evidencia disponible.", ...compositionEvidence },
    findings, nextPhotos: scannerStrings(raw.nextPhotos, 6).length ? scannerStrings(raw.nextPhotos, 6)
      : !regionSupported ? ["Primer plano legible de los códigos del cartucho o disco y del manual.", "Frontal, trasera y pegatinas de distribución de la caja, si la conservas."] : [],
  };
}
