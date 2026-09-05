import verifiedCreditsData from "../../data/index/verified-company-credits.json";
import type {
  DetailEntity,
  GameCompanyCredit,
  GameDetailsFieldProvenance,
  GameDetailsFieldSource,
} from "./types";

export type VerifiedCompanyCreditDetails = {
  developer: DetailEntity | null;
  publisher: DetailEntity | null;
  fieldSources: Partial<Record<"developer" | "publisher", GameDetailsFieldSource>>;
  fieldProvenance: Partial<
    Record<"developer" | "publisher", GameDetailsFieldProvenance>
  >;
  companyCredits?: GameCompanyCredit[];
};

type VerifiedCompanyCreditIndex = {
  schemaVersion: 2;
  credits: Record<string, VerifiedCompanyCreditDetails>;
};

const verifiedCredits = verifiedCreditsData as VerifiedCompanyCreditIndex;

export function getVerifiedCompanyCreditDetails(
  catalogId: string,
): VerifiedCompanyCreditDetails | undefined {
  return verifiedCredits.credits[catalogId];
}
