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

export type PlatformCompanyGroup = {
  id: string;
  labelEs: string;
  descriptionEs: string;
  companySlugs: string[];
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
  | "BASE_MODEL"
  | "EARLY_REVISION"
  | "REVISION"
  | "REDESIGN"
  | "DIGITAL_ONLY_REDESIGN"
  | "MICROCONSOLE"
  | "DEVELOPMENT_HARDWARE"
  | "HOBBYIST_HARDWARE"
  | "MULTIMEDIA_HYBRID"
  | "INTEGRATED_HARDWARE"
  | "COMPLEMENTARY_HARDWARE"
  | "COMMEMORATIVE_HARDWARE"
  | "MID_GENERATION_UPGRADE"
  | "CONTROLLER"
  | "PRO_CONTROLLER"
  | "PERIPHERAL"
  | "VR_HEADSET"
  | "REMOTE_PLAYER"
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
      "BASE_MODEL",
      "EARLY_REVISION",
      "REVISION",
      "REDESIGN",
      "DIGITAL_ONLY_REDESIGN",
      "MICROCONSOLE",
      "DEVELOPMENT_HARDWARE",
      "HOBBYIST_HARDWARE",
      "MULTIMEDIA_HYBRID",
      "INTEGRATED_HARDWARE",
      "COMMEMORATIVE_HARDWARE",
      "MID_GENERATION_UPGRADE",
    ],
  },
  {
    id: "controllers",
    label: "Mandos",
    kinds: ["CONTROLLER", "PRO_CONTROLLER", "ACCESSIBILITY_CONTROLLER"],
  },
  {
    id: "peripherals",
    label: "Periféricos",
    kinds: ["PERIPHERAL", "COMPLEMENTARY_HARDWARE", "VR_HEADSET", "REMOTE_PLAYER"],
  },
];

export type PlatformHardwareGroupId = (typeof PLATFORM_HARDWARE_GROUPS)[number]["id"];

export type PlatformHardwareItem = {
  id: string;
  name: string;
  kind: PlatformHardwareKind;
  yearLabel: string | null;
  manufacturerCompanySlug: string | null;
  manufacturerCompanyName: string | null;
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

export type PlatformArchitectureKind =
  | "PROCESSOR"
  | "GRAPHICS"
  | "OPTICAL_MEDIA"
  | "SYSTEM_SOFTWARE"
  | "MULTIMEDIA"
  | "STORAGE_IO"
  | "AUDIO"
  | "UPSCALING";

export type PlatformArchitecturePartner = {
  companySlug: string | null;
  companyName: string;
  roleLabelEs: string;
};

export type PlatformArchitectureItem = {
  id: string;
  name: string;
  kind: PlatformArchitectureKind;
  summaryEs: string;
  features: string[];
  partners: PlatformArchitecturePartner[];
  sourceIds: string[];
};

export type PlatformServiceKind =
  | "NETWORK_SERVICE"
  | "STORE_SERVICE"
  | "SUBSCRIPTION_SERVICE"
  | "SOCIAL_SERVICE";

export type PlatformHistoryService = {
  id: string;
  name: string;
  kind: PlatformServiceKind;
  launchedLabel: string | null;
  endedLabel?: string | null;
  statusLabelEs?: string | null;
  parentServiceId: string | null;
  successorServiceId?: string | null;
  summaryEs: string;
  features: string[];
  sourceIds: string[];
};

export type PlatformGameRelationship =
  | "FIRST_PARTY"
  | "INDEPENDENT_PARTNER"
  | "THIRD_PARTY";

export type PlatformHistoryGame = {
  title: string;
  catalogId: string | null;
  year: number | null;
  relationshipType: PlatformGameRelationship;
  relationshipLabelEs: string;
  companySlugs: string[];
  sourceIds: string[];
};

export type PlatformHistoryGameGroup = {
  id: string;
  labelEs: string;
  descriptionEs: string;
  games: PlatformHistoryGame[];
};

export type PlatformCompatibilityRevision = {
  hardwareId: string;
  labelEs: string;
  ps1SupportEs: string;
  ps2SupportEs: string;
  notesEs: string[];
  sourceIds: string[];
};

export type PlatformCompatibilityLink = {
  id: string;
  sourcePlatformSlug: string;
  sourcePlatformName: string;
  targetPlatformSlug: string;
  targetPlatformName: string;
  labelEs: string;
  summaryEs: string;
  features: string[];
  sourceIds: string[];
};

export type PlatformEditorialLink = {
  labelEs: string;
  href: string;
};

export type PlatformEditorialCard = {
  id: string;
  eyebrowEs: string | null;
  titleEs: string;
  summaryEs: string;
  detailsEs: string[];
  link?: PlatformEditorialLink | null;
  sourceIds: string[];
};

export type PlatformEditorialSection = {
  id: string;
  titleEs: string;
  dekEs: string | null;
  paragraphsEs: string[];
  cards: PlatformEditorialCard[];
  sourceIds: string[];
};

export type PlatformGenerationStatus = {
  labelEs: string;
  asOf: string;
  summaryEs: string;
  sourceIds: string[];
};

export type PlatformHistorySectionId =
  | "figures"
  | "architecture"
  | "companies"
  | "games"
  | "hardware"
  | "compatibility"
  | "services"
  | "control"
  | "milestones"
  | "legacy"
  | `editorial:${string}`;

export type PlatformHistory = {
  platformSlug: string;
  title: string;
  dekEs: string;
  summaryParagraphsEs: string[];
  historyParagraphsEs?: string[];
  historyTitleEs?: string;
  architectureTitleEs?: string;
  architectureDekEs?: string;
  companiesTitleEs?: string;
  gamesTitleEs?: string;
  hardwareTitleEs?: string;
  servicesTitleEs?: string;
  servicesDekEs?: string;
  generationStatus?: PlatformGenerationStatus;
  figures: PlatformHistoryFigure[];
  architecture?: PlatformArchitectureItem[];
  companies: PlatformHistoryCompany[];
  companyGroups?: PlatformCompanyGroup[];
  genealogies: CompanyGenealogyRelation[];
  gameGroups?: PlatformHistoryGameGroup[];
  hardware: PlatformHardwareItem[];
  services?: PlatformHistoryService[];
  compatibilityByHardwareRevision?: PlatformCompatibilityRevision[];
  compatibilityLinks?: PlatformCompatibilityLink[];
  editorialSections?: PlatformEditorialSection[];
  sectionOrder?: PlatformHistorySectionId[];
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
