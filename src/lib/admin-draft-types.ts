import type { GameDetailsSeoMeta } from "./types";

export type ContributorReviewStatus =
  | "contributor-draft"
  | "pending-review"
  | "approved"
  | "rejected";

export type AdminGameDraft = {
  pcId: number;
  catalogId: string;
  slug: string;
  title: string;
  titlePc: string | null;
  platformSlug: string;
  region: string;
  physicalVariant: string | null;
  edition: string;
  reference: string | null;
  coverUrl: string | null;
  year: number | null;
  releaseDate: string | null;
  players: number | null;
  support: string | null;
  developerName: string | null;
  developerSlug: string | null;
  publisherName: string | null;
  publisherSlug: string | null;
  genreNames: string[];
  subgenreNames: string[];
  facetNames: string[];
  description: string | null;
  seoMeta: GameDetailsSeoMeta | null;
  descriptionMeta: {
    generatedAt?: string;
    method?: "ai" | "template";
    model?: string | null;
    referenceUsed?: boolean;
    referenceUrl?: string | null;
  } | null;
  source: "import" | "manual";
  contributorEmail?: string | null;
  reviewStatus?: ContributorReviewStatus | null;
  submittedAt?: string | null;
  updatedAt: string;
};

export type AdminAiFillEvent =
  | { type: "log"; message: string }
  | { type: "field"; field: keyof AdminGameDraft | "genres"; value: unknown }
  | { type: "error"; message: string }
  | { type: "done"; draft: AdminGameDraft };
