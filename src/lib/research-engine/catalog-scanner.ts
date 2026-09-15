import { publicListedCatalog } from "../catalog";
import { getCatalogEditionGuides } from "../catalog-edition-guides";
import type { CatalogPhysicalEdition } from "../catalog-edition-guide-types";
import type { CatalogGame } from "../types";
import { incompatiblePlatformIdentifiers } from "./platform-identifiers";
import { buildResearchTasks, researchDebtScore } from "./task-planner";
import type {
  ResearchRisk,
  ResearchScanItem,
  ResearchScanResult,
  ResearchSubject,
} from "./types";

export type ResearchCatalogScanOptions = {
  platformSlug?: string | null;
  query?: string | null;
  limit?: number | null;
  includeClean?: boolean;
  now?: Date;
};

function risk(
  code: ResearchRisk["code"],
  priority: ResearchRisk["priority"],
  weight: number,
  reason: string,
  targetField?: ResearchRisk["targetField"],
): ResearchRisk {
  return { code, priority, weight, reason, targetField };
}

function textLooksGenericRegion(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return [
    "europe",
    "europa",
    "pal europa",
    "north america",
    "norteamérica",
    "norteamerica",
    "asia",
    "asia/japón",
    "asia/japon",
    "worldwide",
    "global",
  ].includes(normalized);
}

function textSignalsDownloadOnly(value: string): boolean {
  return /\b(digital[- ]?only|download code|code in box|c[oó]digo de descarga|game[- ]?key card|no game|case only)\b/i.test(value);
}

function catalogSubject(game: CatalogGame): ResearchSubject {
  return {
    id: `catalog:${game.id}`,
    kind: "catalog-entry",
    catalogId: game.id,
    guideId: null,
    physicalEditionId: null,
    title: game.title,
    platformSlug: game.platformSlug,
    edition: game.edition || "Standard",
    region: game.region,
    barcode: null,
    productCodes: [],
    serials: [...new Set([
      ...(game.canonicalSerials ?? []),
      ...(game.resolutionSerials ?? []),
      ...(game.sourceSerials ?? []),
    ])],
    marketRegions: game.marketRegion ? [game.marketRegion] : [],
    evidenceMarkets: [],
    packagingLanguages: game.languages ?? [],
    softwareLanguages: [],
    releaseStatus: null,
    physicalProductType: null,
    containsDisc: null,
    countsAsNativePhysicalRelease: null,
    confidence: game.matchConfidence,
    evidenceCount: game.regionEvidence?.length ?? 0,
    sourceCount: 0,
    notes: [
      ...(game.regionalStatus === "review" ? ["regionalStatus=review"] : []),
      ...(game.excludeReason ? [game.excludeReason] : []),
    ],
  };
}

function editionSubject(
  guide: ReturnType<typeof getCatalogEditionGuides>[number],
  edition: CatalogPhysicalEdition,
): ResearchSubject {
  const representativeCatalogId = edition.catalogIds[0] ?? guide.game.canonicalCatalogId ?? null;
  return {
    id: `edition:${guide.id}:${edition.id}`,
    kind: "physical-edition",
    catalogId: representativeCatalogId,
    guideId: guide.id,
    physicalEditionId: edition.id,
    title: guide.game.title,
    platformSlug: guide.game.platformSlug,
    edition: edition.label,
    region: edition.broadRegion,
    barcode: edition.barcode ?? null,
    productCodes: [...new Set([
      ...edition.productCodes,
      ...edition.softwareFamilyCodes,
      ...(edition.boxCode ? [edition.boxCode] : []),
    ])],
    serials: edition.serial ? [edition.serial] : [],
    marketRegions: edition.marketRegions,
    evidenceMarkets: edition.evidenceMarkets,
    packagingLanguages: edition.packagingLanguages,
    softwareLanguages: edition.softwareLanguages,
    releaseStatus: edition.releaseStatus,
    physicalProductType: edition.physicalProductType ?? null,
    containsDisc: edition.containsDisc ?? null,
    countsAsNativePhysicalRelease: edition.countsAsNativePhysicalRelease ?? null,
    confidence: edition.confidence ?? null,
    evidenceCount: edition.evidence.length,
    sourceCount: guide.sources.length,
    notes: edition.notes,
  };
}

function risksForCatalogSubject(subject: ResearchSubject, game: CatalogGame): ResearchRisk[] {
  const risks: ResearchRisk[] = [];
  const incompatible = incompatiblePlatformIdentifiers(subject.platformSlug, subject.serials);
  if (incompatible.length > 0) {
    risks.push(risk(
      "PLATFORM_IDENTIFIER_CONFLICT",
      "P0",
      30,
      `Identificadores incompatibles con ${subject.platformSlug}: ${incompatible.join(", ")}`,
      "platform",
    ));
  }
  if (textLooksGenericRegion(subject.region)) {
    risks.push(risk(
      "GENERIC_REGION",
      "P1",
      14,
      `La ficha usa una región amplia (${subject.region}) y puede ocultar cajas nacionales distintas.`,
      "market",
    ));
  }
  if (game.regionalStatus === "review") {
    risks.push(risk(
      "UNCONFIRMED_PHYSICAL_VARIANT",
      "P1",
      12,
      "La identidad regional está marcada para revisión.",
      "market",
    ));
  }
  if (game.listingStatus === "pending") {
    risks.push(risk(
      "CATALOG_PENDING_REVIEW",
      "P2",
      4,
      "La ficha de catálogo sigue pendiente de revisión.",
    ));
  }
  if (textSignalsDownloadOnly(`${subject.edition} ${subject.title}`)) {
    risks.push(risk(
      "PHYSICAL_STATUS_CONFLICT",
      "P0",
      24,
      "El nombre de la ficha contiene señales de descarga/code-in-box y necesita verificar su soporte real.",
      "physicalContentStatus",
    ));
  }
  return risks;
}

function risksForEditionSubject(subject: ResearchSubject, edition: CatalogPhysicalEdition): ResearchRisk[] {
  const risks: ResearchRisk[] = [];
  const incompatible = incompatiblePlatformIdentifiers(
    subject.platformSlug,
    [...subject.productCodes, ...subject.serials],
    { allowPreviousGenerationDisc: edition.physicalProductType === "PREVIOUS_GEN_DISC_WITH_UPGRADE" },
  );
  if (incompatible.length > 0) {
    risks.push(risk(
      "PLATFORM_IDENTIFIER_CONFLICT",
      "P0",
      34,
      `La edición contiene identificadores incompatibles con ${subject.platformSlug}: ${incompatible.join(", ")}`,
      "platform",
    ));
  }

  if (edition.physicalProductType === "DOWNLOAD_CODE_IN_BOX") {
    if (edition.containsDisc === true || edition.countsAsNativePhysicalRelease !== false) {
      risks.push(risk(
        "DOWNLOAD_CODE_COUNTED_AS_DISC",
        "P0",
        35,
        "Un producto DOWNLOAD_CODE_IN_BOX no debe contener disco ni contar como lanzamiento físico nativo.",
        "physicalContentStatus",
      ));
    }
  }

  if (edition.releaseStatus === "CANCELED_PHYSICAL_RELEASE" && edition.countsAsNativePhysicalRelease === true) {
    risks.push(risk(
      "CANCELED_RELEASE_COUNTED_AS_PHYSICAL",
      "P0",
      40,
      "Una edición física cancelada está marcada para contar como release nativo.",
      "releaseStatus",
    ));
  }

  if (edition.editionType === "STEELBOOK" && edition.containsDisc === false && edition.countsAsNativePhysicalRelease !== false) {
    risks.push(risk(
      "STEELBOOK_WITHOUT_GAME_COUNTED_AS_EDITION",
      "P0",
      38,
      "SteelBook sin disco/juego no debe contar como edición física del juego.",
      "physicalContentStatus",
    ));
  }

  if (textSignalsDownloadOnly(`${edition.label} ${edition.notes.join(" ")}`) && edition.physicalProductType !== "DOWNLOAD_CODE_IN_BOX") {
    risks.push(risk(
      "PHYSICAL_STATUS_CONFLICT",
      "P0",
      28,
      "La documentación menciona descarga, Game-Key Card o no-game pero el tipo material no lo refleja.",
      "physicalContentStatus",
    ));
  }

  if (edition.releaseStatus === "RELEASED" && !edition.barcode) {
    risks.push(risk(
      "MISSING_BARCODE",
      "P1",
      18,
      "Release físico documentado sin EAN/UPC/JAN exterior.",
      "barcode",
    ));
  }

  if (edition.releaseStatus === "RELEASED" && edition.marketRegions.length === 0) {
    risks.push(risk(
      "MISSING_MARKET_MAPPING",
      "P1",
      16,
      edition.evidenceMarkets.length > 0
        ? `Hay mercados de evidencia (${edition.evidenceMarkets.join(", ")}) pero la caja no tiene mercado físico resuelto.`
        : "La caja física no tiene mercado nacional resuelto.",
      "market",
    ));
  }

  if (edition.releaseStatus === "RELEASED" && edition.packagingLanguages.length === 0) {
    risks.push(risk(
      "MISSING_PACKAGING_LANGUAGES",
      "P2",
      6,
      "Los idiomas impresos del packaging no están documentados.",
      "packagingLanguages",
    ));
  }

  if (edition.evidence.length === 0) {
    risks.push(risk(
      "WEAK_OR_MISSING_EVIDENCE",
      "P1",
      15,
      "La edición no tiene evidencia específica enlazada.",
    ));
  }

  if (edition.confidence === "PENDING_IDENTIFIER") {
    risks.push(risk(
      "PENDING_IDENTIFIER",
      "P1",
      16,
      "La edición mantiene un identificador físico pendiente.",
      "barcode",
    ));
  } else if (edition.confidence === "UNCONFIRMED") {
    risks.push(risk(
      "UNCONFIRMED_PHYSICAL_VARIANT",
      "P1",
      18,
      "La existencia o separación de esta variante física sigue sin confirmar.",
    ));
  }

  return risks;
}

function matchesFilters(subject: ResearchSubject, options: ResearchCatalogScanOptions): boolean {
  if (options.platformSlug && subject.platformSlug !== options.platformSlug) return false;
  const query = options.query?.trim().toLowerCase();
  if (!query) return true;
  return [
    subject.title,
    subject.edition,
    subject.region,
    subject.barcode ?? "",
    subject.productCodes.join(" "),
    subject.serials.join(" "),
  ].join(" ").toLowerCase().includes(query);
}

function itemFor(subject: ResearchSubject, risks: ResearchRisk[], now: Date): ResearchScanItem {
  return {
    subject,
    risks,
    debtScore: researchDebtScore(risks),
    tasks: buildResearchTasks(subject.id, risks, now),
  };
}

export function scanResearchCatalog(options: ResearchCatalogScanOptions = {}): ResearchScanResult {
  const now = options.now ?? new Date();
  const allItems: ResearchScanItem[] = [];
  let scanned = 0;

  for (const game of publicListedCatalog) {
    const subject = catalogSubject(game);
    if (!matchesFilters(subject, options)) continue;
    scanned += 1;
    const risks = risksForCatalogSubject(subject, game);
    if (risks.length > 0 || options.includeClean) allItems.push(itemFor(subject, risks, now));
  }

  for (const guide of getCatalogEditionGuides()) {
    for (const edition of guide.physicalEditions) {
      const subject = editionSubject(guide, edition);
      if (!matchesFilters(subject, options)) continue;
      scanned += 1;
      const risks = risksForEditionSubject(subject, edition);
      if (risks.length > 0 || options.includeClean) allItems.push(itemFor(subject, risks, now));
    }
  }

  const sorted = allItems.sort((a, b) => b.debtScore - a.debtScore || a.subject.id.localeCompare(b.subject.id));
  const limited = options.limit && options.limit > 0 ? sorted.slice(0, options.limit) : sorted;
  const highest = (item: ResearchScanItem): "P0" | "P1" | "P2" | null =>
    item.risks.some((entry) => entry.priority === "P0")
      ? "P0"
      : item.risks.some((entry) => entry.priority === "P1")
        ? "P1"
        : item.risks.some((entry) => entry.priority === "P2")
          ? "P2"
          : null;

  return {
    schemaVersion: 1,
    mode: "research-only",
    generatedAt: now.toISOString(),
    filters: {
      platformSlug: options.platformSlug ?? null,
      query: options.query ?? null,
      limit: options.limit ?? null,
    },
    summary: {
      scanned,
      flagged: allItems.filter((item) => item.risks.length > 0).length,
      p0: allItems.filter((item) => highest(item) === "P0").length,
      p1: allItems.filter((item) => highest(item) === "P1").length,
      p2: allItems.filter((item) => highest(item) === "P2").length,
      totalDebt: allItems.reduce((sum, item) => sum + item.debtScore, 0),
    },
    items: limited,
  };
}
