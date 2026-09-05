import type {
  DetailEntity,
  GameCompanyCredit,
  GameCompanyCreditRole,
  GameDetails,
} from "./types";

export const COMPANY_CREDIT_ROLE_LABELS: Record<GameCompanyCreditRole, string> = {
  developer: "Desarrolladora",
  originalDeveloper: "Desarrolladora original",
  portDeveloper: "Estudio del port",
  remasterDeveloper: "Estudio de la remasterización",
  publisher: "Publicadora",
  originalPublisher: "Publicadora original",
  regionalPublisher: "Publicadora regional",
  digitalPublisher: "Editora digital",
  physicalPublisherOrDistributor: "Editora o distribuidora física",
};

const DEVELOPER_ROLES = new Set<GameCompanyCreditRole>([
  "developer",
  "originalDeveloper",
  "portDeveloper",
  "remasterDeveloper",
]);

const PUBLISHER_ROLES = new Set<GameCompanyCreditRole>([
  "publisher",
  "originalPublisher",
  "regionalPublisher",
  "digitalPublisher",
]);

function legacyCredit(
  role: "developer" | "publisher",
  company: DetailEntity | null | undefined,
): GameCompanyCredit | null {
  if (!company) return null;
  return {
    role,
    company,
    provenance: {
      source: company.source === "merged" ? "research" : company.source ?? "museum",
      evidenceUrls: [],
      evidenceSummary: "Crédito legacy conservado para compatibilidad.",
      reviewedAt: "1970-01-01",
      reviewBatch: "legacy",
    },
  };
}

/** Devuelve créditos por función, usando los campos legacy solo cuando no existe esa función explícita. */
export function resolveGameCompanyCredits(
  details: Pick<GameDetails, "companyCredits" | "developer" | "publisher">,
): GameCompanyCredit[] {
  const explicit = details.companyCredits ?? [];
  const credits = [...explicit];

  if (!explicit.some((credit) => DEVELOPER_ROLES.has(credit.role))) {
    const developer = legacyCredit("developer", details.developer);
    if (developer) credits.push(developer);
  }
  if (!explicit.some((credit) => PUBLISHER_ROLES.has(credit.role))) {
    const publisher = legacyCredit("publisher", details.publisher);
    if (publisher) credits.push(publisher);
  }

  const seen = new Set<string>();
  return credits.filter((credit) => {
    const key = `${credit.role}:${credit.company.slug}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function companyCreditsForRole(
  details: Pick<GameDetails, "companyCredits" | "developer" | "publisher">,
  role: GameCompanyCreditRole,
): GameCompanyCredit[] {
  return resolveGameCompanyCredits(details).filter((credit) => credit.role === role);
}
