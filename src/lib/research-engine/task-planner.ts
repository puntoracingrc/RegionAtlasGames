import type {
  ResearchEvidenceKind,
  ResearchRisk,
  ResearchTask,
  ResearchTaskKind,
} from "./types";
import { RESEARCH_COVERAGE_BUCKETS, type DurableResearchTask, type ResearchTargetField } from "./v2-types";

function taskKindForRisk(risk: ResearchRisk): ResearchTaskKind {
  switch (risk.code) {
    case "PLATFORM_IDENTIFIER_CONFLICT": return "VERIFY_PLATFORM";
    case "PHYSICAL_STATUS_CONFLICT":
    case "CANCELED_RELEASE_COUNTED_AS_PHYSICAL":
    case "DOWNLOAD_CODE_COUNTED_AS_DISC":
    case "STEELBOOK_WITHOUT_GAME_COUNTED_AS_EDITION":
      return "VERIFY_PHYSICAL_STATUS";
    case "MISSING_BARCODE": return "RESOLVE_BARCODE";
    case "MISSING_MARKET_MAPPING":
    case "GENERIC_REGION":
      return "RESOLVE_MARKET";
    case "MISSING_PACKAGING_LANGUAGES": return "RESOLVE_PACKAGING";
    case "PENDING_IDENTIFIER":
    case "UNCONFIRMED_PHYSICAL_VARIANT":
      return "RESOLVE_CONFLICT";
    default:
      return "STRENGTHEN_EVIDENCE";
  }
}

function evidenceForTask(kind: ResearchTaskKind): ResearchEvidenceKind[] {
  switch (kind) {
    case "VERIFY_PLATFORM":
      return ["PHYSICAL_SCAN", "TECHNICAL_DATABASE", "RETAILER"];
    case "VERIFY_PHYSICAL_STATUS":
      return ["PHYSICAL_SCAN", "PUBLISHER", "PLATFORM_HOLDER", "RETAILER"];
    case "RESOLVE_BARCODE":
      return ["PHYSICAL_SCAN", "RETAILER", "COLLECTOR_DATABASE"];
    case "RESOLVE_MARKET":
      return ["PHYSICAL_SCAN", "RETAILER", "COLLECTOR_DATABASE"];
    case "RESOLVE_PACKAGING":
      return ["OWN_SCAN", "PHYSICAL_SCAN"];
    case "RESOLVE_CONFLICT":
      return ["PHYSICAL_SCAN", "TECHNICAL_DATABASE", "RETAILER"];
    default:
      return ["PHYSICAL_SCAN", "PUBLISHER", "TECHNICAL_DATABASE", "RETAILER"];
  }
}

function questionForRisk(risk: ResearchRisk): string {
  switch (risk.code) {
    case "PLATFORM_IDENTIFIER_CONFLICT":
      return "¿El identificador pertenece realmente a esta plataforma o está contaminado por otra versión?";
    case "PHYSICAL_STATUS_CONFLICT":
      return "¿Qué soporte incluye realmente el producto: disco/cartucho, código, Game-Key Card o ningún juego?";
    case "CANCELED_RELEASE_COUNTED_AS_PHYSICAL":
      return "¿La edición física llegó realmente a publicarse o fue cancelada antes de retail?";
    case "DOWNLOAD_CODE_COUNTED_AS_DISC":
      return "¿La caja contiene un soporte de juego o únicamente un código de descarga?";
    case "STEELBOOK_WITHOUT_GAME_COUNTED_AS_EDITION":
      return "¿El SteelBook incluye el juego o es sólo un bonus/case-only?";
    case "MISSING_BARCODE":
      return "¿Cuál es el EAN/UPC/JAN exterior confirmado de esta variante física?";
    case "MISSING_MARKET_MAPPING":
    case "GENERIC_REGION":
      return "¿Qué mercado o mercados corresponden a esta caja física concreta?";
    case "MISSING_PACKAGING_LANGUAGES":
      return "¿Qué idiomas aparecen realmente impresos en el packaging físico?";
    case "PENDING_IDENTIFIER":
      return "¿Puede cerrarse el identificador físico pendiente con evidencia adicional?";
    case "UNCONFIRMED_PHYSICAL_VARIANT":
      return "¿Existe realmente una variante física diferenciada o es un duplicado/importación?";
    default:
      return "¿Puede reforzarse la evidencia de esta ficha con una fuente independiente?";
  }
}

export function buildResearchTasks(subjectId: string, risks: ResearchRisk[], now = new Date()): ResearchTask[] {
  const byKind = new Map<ResearchTaskKind, ResearchRisk[]>();
  for (const risk of risks) {
    const kind = taskKindForRisk(risk);
    byKind.set(kind, [...(byKind.get(kind) ?? []), risk]);
  }

  return [...byKind.entries()].map(([kind, grouped], index) => {
    const priority = grouped.some((risk) => risk.priority === "P0")
      ? "P0"
      : grouped.some((risk) => risk.priority === "P1")
        ? "P1"
        : "P2";
    const lead = [...grouped].sort((a, b) => b.weight - a.weight)[0];
    return {
      id: `${subjectId}:${kind.toLowerCase()}:${index + 1}`,
      subjectId,
      kind,
      priority,
      question: questionForRisk(lead),
      requiredEvidence: evidenceForTask(kind),
      riskCodes: grouped.map((risk) => risk.code),
      status: "queued",
      createdAt: now.toISOString(),
    };
  });
}

export function researchDebtScore(risks: ResearchRisk[]): number {
  const priorityBase = { P0: 100, P1: 30, P2: 5 } as const;
  return risks.reduce((sum, risk) => sum + priorityBase[risk.priority] + Math.max(0, risk.weight), 0);
}

export function buildWorldwideResearchTasks(input: {
  subjectId: string;
  title: string;
  platformSlug: string;
  now?: Date;
}): DurableResearchTask[] {
  const now = (input.now ?? new Date()).toISOString();
  const targetField: ResearchTargetField = ["n64", "gameboy"].includes(input.platformSlug) ? "PRODUCT_CODE" : "BARCODE";
  return RESEARCH_COVERAGE_BUCKETS.map((coverageBucket) => ({
    id: `${input.subjectId}:worldwide:${coverageBucket.toLowerCase()}:${targetField.toLowerCase()}`,
    subjectId: input.subjectId,
    targetField,
    question: `Map ${input.title} on ${input.platformSlug} for ${coverageBucket}; discover physical identifiers, exact-search every candidate, and close only after search exhaustion.`,
    priority: "P1",
    evidenceNeeded: ["STRUCTURED_RELEASE_LEAD", "INDEPENDENT_EXACT_IDENTIFIER_CORROBORATION"],
    riskCodes: [],
    researchMode: "WORLDWIDE_VARIANT_DISCOVERY",
    coverageBucket,
    regionalTitleCandidates: [],
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
  }));
}
