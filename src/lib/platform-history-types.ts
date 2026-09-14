export type PlatformHistorySource = {
  id: string;
  title: string;
  publication: string;
  publisher: string;
  kind: "magazine" | "official" | "interview" | "reference";
  language: string | null;
  citation: string | null;
  url: string | null;
};

export type PlatformHistoryFigure = {
  personSlug: string;
  personName: string;
  roleLabelEs: string;
  contributionEs: string;
  period: string | null;
  sourceIds: string[];
};

export type PlatformCompanyRelationship =
  | "FIRST_PARTY"
  | "FIRST_PARTY_ACQUISITION"
  | "EARLY_THIRD_PARTY"
  | "STRATEGIC_THIRD_PARTY"
  | "KEY_PUBLISHER"
  | "KEY_DEVELOPER"
  | "HARDWARE_PARTNER"
  | "REGIONAL_PARTNER";

export type PlatformHistoryCompany = {
  companySlug: string;
  companyName: string;
  relationshipType: PlatformCompanyRelationship;
  relationshipLabelEs: string;
  period: string | null;
  contributionEs: string;
  relatedWorks: string[];
  relatedCatalogEntries?: { id: string; title: string }[];
  sourceIds: string[];
};

export type CompanyGenealogyRelation = {
  id: string;
  sourceCompanySlug: string;
  sourceCompanyName: string;
  relationshipType:
    | "RENAMED_TO"
    | "ACQUIRED_BY"
    | "REORGANIZED_AS"
    | "MERGED_INTO"
    | "CLOSED"
    | "INVESTMENT_FROM";
  targetCompanySlug: string | null;
  targetCompanyName: string | null;
  year: number | null;
  summaryEs: string;
  sourceIds: string[];
};

export type PlatformHardwareKind =
  | "REVISION"
  | "REDESIGN"
  | "DEVELOPMENT_HARDWARE"
  | "HOBBYIST_HARDWARE"
  | "COMPLEMENTARY_HARDWARE"
  | "COMMEMORATIVE_HARDWARE"
  | "CONTROLLER"
  | "PERIPHERAL"
  | "ACCESSIBILITY_CONTROLLER";

export const PLATFORM_HARDWARE_GROUPS: {
  id: "models" | "controllers" | "peripherals";
  label: string;
  kinds: PlatformHardwareKind[];
}[] = [
  {
    id: "models",
    label: "Modelos y revisiones",
    kinds: [
      "REVISION",
      "REDESIGN",
      "DEVELOPMENT_HARDWARE",
      "HOBBYIST_HARDWARE",
      "COMMEMORATIVE_HARDWARE",
    ],
  },
  {
    id: "controllers",
    label: "Mandos",
    kinds: ["CONTROLLER", "ACCESSIBILITY_CONTROLLER"],
  },
  {
    id: "peripherals",
    label: "Periféricos",
    kinds: ["PERIPHERAL", "COMPLEMENTARY_HARDWARE"],
  },
];

export type PlatformHardwareGroupId = (typeof PLATFORM_HARDWARE_GROUPS)[number]["id"];

export type PlatformHardwareItem = {
  id: string;
  name: string;
  kind: PlatformHardwareKind;
  yearLabel: string | null;
  manufacturerCompanySlug: string;
  manufacturerCompanyName: string;
  modelNumbers: string[];
  summaryEs: string;
  features: string[];
  relatedWorks: string[];
  relatedCatalogEntries?: { id: string; title: string }[];
  relatedPersonSlugs: string[];
  sourceIds: string[];
};

export type PlatformHistoryMilestone = {
  id: string;
  yearLabel: string;
  sortYear: number;
  title: string;
  summaryEs: string;
  sourceIds: string[];
};

export type PlatformHistory = {
  platformSlug: string;
  title: string;
  dekEs: string;
  summaryParagraphsEs: string[];
  figures: PlatformHistoryFigure[];
  companies: PlatformHistoryCompany[];
  genealogies: CompanyGenealogyRelation[];
  hardware: PlatformHardwareItem[];
  milestones: PlatformHistoryMilestone[];
  legacyEs: string[];
  sources: PlatformHistorySource[];
  lastReviewed: string;
};

export type PlatformHistoryData = {
  version: number;
  generatedAt: string;
  platforms: PlatformHistory[];
};

export type CompanyPlatformHistoryLink = PlatformHistoryCompany & {
  platformSlug: string;
  platformName: string;
};

export type CompanyGenealogyLink = CompanyGenealogyRelation & {
  platformSlug: string;
};
