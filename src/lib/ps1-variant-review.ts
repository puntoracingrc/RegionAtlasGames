import { readFileSync } from "node:fs";
import path from "node:path";
import type { Ps1GraphicReference } from "./ps1-regional";
import type { PendingEdition } from "./catalog-review-policy";

export type Ps1VariantReview = {
  title: string;
  kind: Exclude<PendingEdition, "all" | "other">;
  status: "packaging_references_found" | "packaging_source_needed";
  physicalVariantResolved: false;
  researchCandidateIds: string[];
  references: Array<Ps1GraphicReference & { candidateCatalogIds: string[]; assignmentVerified: false }>;
};
let reviews: Record<string, Ps1VariantReview> | undefined;
export function getPs1VariantReview(catalogId: string): Ps1VariantReview | undefined {
  if (!catalogId.startsWith("ps1-")) return undefined;
  if (!reviews) reviews = JSON.parse(readFileSync(path.join(process.cwd(), "data/ps1-variant-review.json"), "utf8")).entries;
  return reviews?.[catalogId];
}
