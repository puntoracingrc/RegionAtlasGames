import type { GameDetailsSeoMeta } from "./types";

export type AdminGameDraft = {
  pcId: number;
  catalogId: string;
  slug: string;
  title: string;
  titlePc: string | null;
  platformSlug: string;
  region: string;
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
  updatedAt: string;
};

export type AdminAiFillEvent =
  | { type: "log"; message: string }
  | { type: "field"; field: keyof AdminGameDraft | "genres"; value: unknown }
  | { type: "error"; message: string }
  | { type: "done"; draft: AdminGameDraft };
