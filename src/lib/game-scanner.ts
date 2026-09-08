import titleAliases from "../../data/scanner-title-aliases.json";

export const SCANNER_POLICY = "region-atlas-scanner-v1.1";
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
  multipleGames?: boolean; multiplePlatforms?: boolean; identityConflict?: boolean; platformConflict?: boolean; titleAliasId?: string | null;
  photoReadings?: { photo: number; title: string | null; platformSlug: string | null; identityConfidence: number; multipleGames: boolean; uncertainties: string[] }[];
};
export type ScannerSkipReason = "no_observations" | "platform_unknown" | "platform_conflict" | "platform_mismatch" | "identity_conflict";
export const SCANNER_SKIP_LABELS: Record<ScannerSkipReason, string> = {
  no_observations: "No se han obtenido observaciones utilizables de las fotos.",
  platform_unknown: "No se ha podido reconocer la plataforma en las fotos.",
  platform_conflict: "Las fotos contienen lecturas de plataformas diferentes.",
  platform_mismatch: "La plataforma reconocida no coincide con la seleccionada.",
  identity_conflict: "Las fotos contienen títulos distintos sin una equivalencia revisada. No se ha asignado una región al conjunto.",
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
  interpretation?: { status: "completed"; reason: null } | { status: "skipped"; reason: ScannerSkipReason };
  perceptionMode?: "joint" | "per_photo";
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
  const identityConflict = raw.multipleGames === true;
  const platformConflict = raw.multiplePlatforms === true;
  return {
    title: identityConflict || platformConflict ? null : scannerText(raw.title, 180) || null,
    platformSlug: platformConflict ? null : scannerText(raw.platformSlug, 40) || null,
    identityConfidence: identityConflict || platformConflict ? 0 : confidence,
    multipleGames: identityConflict, multiplePlatforms: platformConflict, identityConflict, platformConflict,
    observations, uncertainties: scannerStrings(raw.uncertainties),
  };
}

export const scannerTitleKey = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

function scannerTitleAlias(title: string, platformSlug: string | null) {
  const key = scannerTitleKey(title);
  const matches = titleAliases.groups.filter((group) => group.status === "reviewed_title_equivalence" && group.platformSlug === platformSlug
    && group.titles.some((name) => scannerTitleKey(name) === key));
  return matches.length === 1 ? matches[0] : undefined;
}

export function scannerEquivalentTitles(title: string, platformSlug: string): string[] {
  return scannerTitleAlias(title, platformSlug)?.titles ?? [title];
}

export function mergeScannerPerceptions(parts: ScannerPerception[]): ScannerPerception {
  const titles = parts.map((p) => p.title).filter((v): v is string => Boolean(v));
  const platforms = [...new Set(parts.map((p) => p.platformSlug).filter(Boolean))];
  const platformConflict = parts.some((part) => part.platformConflict) || platforms.length > 1;
  const platformSlug = platformConflict ? null : platforms[0] ?? null;
  // Reviewed title aliases do not establish regional edition or component compatibility.
  const identityKeys = titles.map((title) => scannerTitleAlias(title, platformSlug)?.id ?? scannerTitleKey(title));
  const identityConflict = parts.some((part) => part.multipleGames) || new Set(identityKeys).size > 1;
  const identified = parts.filter((p) => p.title && p.platformSlug);
  const observations = parts.flatMap((part, index) => part.observations.map((o) => ({ ...o, photo: index + 1 })))
    .map((o, index) => ({ ...o, id: `o${index + 1}` }));
  const title = identityConflict || platformConflict ? null : [...titles].sort((a, b) => b.length - a.length)[0] ?? null;
  const photoReadings = parts.map((part, index) => ({ photo: index + 1, title: part.title, platformSlug: part.platformSlug,
    identityConfidence: part.identityConfidence, multipleGames: part.multipleGames === true, uncertainties: part.uncertainties }));
  return { title, platformSlug, identityConflict, platformConflict,
    titleAliasId: title ? scannerTitleAlias(title, platformSlug)?.id ?? null : null,
    identityConfidence: identityConflict || platformConflict || !identified.length ? 0 : Math.min(...identified.map((p) => p.identityConfidence)),
    observations, photoReadings, uncertainties: [
      ...(platformConflict ? [SCANNER_SKIP_LABELS.platform_conflict] : []),
      ...(identityConflict ? [SCANNER_SKIP_LABELS.identity_conflict] : []),
      ...photoReadings.flatMap((part) => part.uncertainties.map((text) => `Foto ${part.photo}: ${text}`)),
    ].slice(0, 12) };
}

export function scannerInterpretationSkipReason(perception: ScannerPerception, platformSlug: string): ScannerSkipReason | null {
  if (!perception.observations.length) return "no_observations";
  if (perception.platformConflict) return "platform_conflict";
  if (!perception.platformSlug) return "platform_unknown";
  if (perception.platformSlug !== platformSlug) return "platform_mismatch";
  if (perception.identityConflict) return "identity_conflict";
  return null;
}

const REGIONS = new Set(["PAL España", "PAL Europa", "PAL Italia", "PAL Francia", "PAL Alemania", "PAL UK", "PAL Australia", "NTSC USA", "NTSC-J Japón"]);

export function normalizeScannerReasoning(value: unknown, perception: ScannerPerception, sources: ScannerSource[], platformSlug: string, knownVariantIds: string[] = []) {
  const raw = object(value);
  const platformMatches = perception.platformSlug === platformSlug;
  const skipReason = scannerInterpretationSkipReason(perception, platformSlug);
  const validObservations = new Set(perception.observations.map((o) => o.id));
  const validSources = new Set(sources.map((s) => s.id));
  const evidence = (row: Record<string, unknown>) => ({
    observationIds: scannerStrings(row.observationIds).filter((id) => validObservations.has(id)),
    sourceIds: scannerStrings(row.sourceIds).filter((id) => validSources.has(id)),
  });
  const region = object(raw.region);
  const regionEvidence = evidence(region);
  const regionSupported = !skipReason && regionEvidence.observationIds.length > 0 && REGIONS.has(String(region.value));
  const composition = object(raw.composition);
  const compositionEvidence = evidence(composition);
  // A documented pairing needs actual components AND a documentary reference, never merely different languages.
  const components = new Set(perception.observations.filter((o) => compositionEvidence.observationIds.includes(o.id)).map((o) => o.component));
  const variantId = scannerText(composition.variantId, 200);
  const pairingSupported = !skipReason && components.size >= 2 && compositionEvidence.sourceIds.length > 0 && knownVariantIds.includes(variantId);
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
      explanation: regionSupported ? scannerText(region.explanation) : skipReason ? SCANNER_SKIP_LABELS[skipReason] : "Región no determinada con las evidencias disponibles.", ...regionEvidence },
    composition: { status, variantId: pairingSupported ? variantId : null, explanation: status !== "unknown" ? scannerText(composition.explanation)
      : "No se puede confirmar la combinación original de estas piezas con la evidencia disponible.", ...compositionEvidence },
    findings, nextPhotos: scannerStrings(raw.nextPhotos, 6).length ? scannerStrings(raw.nextPhotos, 6)
      : !regionSupported ? ["Primer plano legible de los códigos del cartucho o disco y del manual.", "Frontal, trasera y pegatinas de distribución de la caja, si la conservas."] : [],
  };
}
