import type {
  DetailEntity,
  GameCompanyCredit,
  GameCompanyCreditRole,
  GameDetails,
} from "./types";

export const COMPANY_CREDIT_ROLE_LABELS: Record<GameCompanyCreditRole, string> = {
  developer: "Desarrolladora",
  publisher: "Publicadora",
  digitalPublisher: "Editora digital",
  physicalPublisherOrDistributor: "Editora o distribuidora física",
};

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
  const roles = new Set(explicit.map((credit) => credit.role));
  const credits = [...explicit];

  if (!roles.has("developer")) {
    const developer = legacyCredit("developer", details.developer);
    if (developer) credits.push(developer);
  }
  if (!roles.has("publisher")) {
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
