import { readFile } from "node:fs/promises";
import path from "node:path";
import gameboy from "../../data/region-research/gameboy.json";
import gameboyReviewed from "../../data/region-research/gameboy-reviewed-guidance.json";
import snes from "../../data/region-research/snes.json";
import snesDistributions from "../../data/region-research/snes-distributions.json";
import megadrive from "../../data/region-research/megadrive.json";
import nes from "../../data/region-research/nes.json";
import { loadMarketplaceCollectorLearning } from "./marketplace-collector-context";
import { object, scannerEquivalentTitles, scannerText, type ScannerPerception, type ScannerSource } from "./game-scanner";

type ResearchEntry = { id: string; text: string; status?: string; sourceIds: string[]; catalogIds?: string[]; distributionVariants?: unknown[] };
type ResearchDocument = {
  platformSlug: string; batch: string; reviewedAt: string;
  sources: Record<string, { url: string; attribution?: string; kind?: string }>;
  inspectionRules: ResearchEntry[]; gameReferences: ResearchEntry[];
};
const documents = [gameboy, gameboyReviewed, snes, snesDistributions, megadrive, nes] as ResearchDocument[];
type CatalogIdentity = { id: string; title: string; titlePc?: string | null; platformSlug: string; listingStatus?: string; catalogKind?: string };
let identities: Promise<CatalogIdentity[]> | undefined;

function normalizeTitle(title: string): string {
  return title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function exactScannerCatalogIds(catalog: CatalogIdentity[], perception: ScannerPerception, platformSlug: string): string[] {
  if (perception.identityConflict || perception.platformConflict || perception.identityConfidence < 0.85 || perception.platformSlug !== platformSlug || !perception.title) return [];
  const titles = scannerEquivalentTitles(perception.title, platformSlug).map(normalizeTitle).filter(Boolean);
  if (!titles.length) return [];
  return catalog.filter((game) => game.platformSlug === platformSlug && game.listingStatus !== "excluded"
    && (!game.catalogKind || game.catalogKind === "game")
    && [game.title, game.titlePc].some((name) => name && titles.includes(normalizeTitle(name)))).map((game) => game.id);
}

export function scannerDocumentaryKnowledge(platformSlug: string, catalogIds: string[]) {
  const sources: ScannerSource[] = [];
  const entries: { id: string; text: string; sourceIds: string[]; variants: unknown[] }[] = [];
  for (const document of documents.filter((doc) => doc.platformSlug === platformSlug)) {
    const selected = [...document.inspectionRules, ...document.gameReferences.filter((entry) => entry.catalogIds?.some((id) => catalogIds.includes(id)))];
    for (const entry of selected) {
      if (entry.status && entry.status !== "reviewed_guidance") continue;
      const ids: string[] = [];
      for (const key of entry.sourceIds) {
        const source = document.sources[key];
        if (!source || !/^https:\/\//i.test(source.url)) continue;
        const id = `${document.batch}:${key}`;
        if (!sources.some((s) => s.id === id)) sources.push({ id, url: source.url,
          label: source.attribution || (source.kind === "visually_reviewed_listing" ? "Ejemplar revisado" : new URL(source.url).hostname), reviewedAt: document.reviewedAt });
        ids.push(id);
      }
      if (ids.length) entries.push({ id: `${document.batch}:${entry.id}`, text: entry.text, sourceIds: ids, variants: entry.distributionVariants ?? [] });
    }
  }
  const knownVariantIds = entries.flatMap((entry) => entry.variants.map(object)
    .filter((variant) => ["community_documented_distribution", "observed_regional_specimen"].includes(String(variant.associationStatus)))
    .map((variant) => scannerText(variant.id, 200)).filter(Boolean));
  return { sources, entries, knownVariantIds };
}

export async function loadScannerKnowledge(platformSlug: string, perception: ScannerPerception) {
  identities ??= readFile(path.join(process.cwd(), "data/catalog.json"), "utf8")
    .then((text) => (JSON.parse(text) as CatalogIdentity[]).map(({ id, title, titlePc, platformSlug, listingStatus, catalogKind }) =>
      ({ id, title, titlePc, platformSlug, listingStatus, catalogKind })))
    .catch((error) => { identities = undefined; throw error; });
  const ids = exactScannerCatalogIds(await identities, perception, platformSlug);
  const documentary = scannerDocumentaryKnowledge(platformSlug, ids);
  const learning = await loadMarketplaceCollectorLearning();
  const examples = [];
  for (const catalogId of ids) {
    const game = learning?.games?.[catalogId];
    if (!game) continue;
    // Each regional example stays separate. No reference photos enter the perception call.
    for (const [index, example] of (game.approvedExamples ?? []).slice(0, 4).entries()) {
      examples.push({ catalogId, region: example.region, evidence: example.regionEvidence,
        observations: example.visualObservations, note: example.note, decidedAt: example.decidedAt,
        originalContentsExpected: game.originalContentsExpected, manualExpected: game.manualExpected, index });
    }
  }
  return { ...documentary, examples: examples.slice(0, 24),
    knowledge: { platformGuidance: documentary.entries.length > 0, exactGameMatches: ids.length, learningAvailable: learning !== null } };
}

export function scannerUsageFromResponse(value: unknown) {
  const data = object(value);
  const usage = object(data.usage);
  const tokens = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
  return {
    responseId: scannerText(data.id, 120) || null, model: scannerText(data.model, 120) || null,
    inputTokens: tokens(usage.input_tokens), outputTokens: tokens(usage.output_tokens), totalTokens: tokens(usage.total_tokens),
    cachedInputTokens: tokens(object(usage.input_tokens_details).cached_tokens),
  };
}
