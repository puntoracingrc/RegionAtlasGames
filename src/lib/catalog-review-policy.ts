import curation from "../../data/ps1-catalog-curation.json";

type ReviewGame = { id: string; title: string; platformSlug: string; regionalStatus?: string };
export type PendingEdition = "all" | "platinum" | "greatest-hits" | "long-box" | "other";
export type CatalogReviewCounts = { documented: number; pending: number; groupedNames: number; variants: Record<Exclude<PendingEdition, "all">, number> };

export const PENDING_EDITION_OPTIONS = [
  { value: "all", label: "Todas las fichas pendientes" },
  { value: "platinum", label: "Platinum" },
  { value: "greatest-hits", label: "Greatest Hits" },
  { value: "long-box", label: "Long Box" },
  { value: "other", label: "Resto de pendientes" },
] as const;

const groupsById = new Map(curation.groups.flatMap((group) => group.catalogIds.map((id) => [id, group] as const)));
export function ps1CatalogReviewGroup(id: string) { return groupsById.get(id); }
export function isGroupedCatalogName(game: Pick<ReviewGame, "id">): boolean {
  const group = groupsById.get(game.id);
  return group?.decision === "group_names" && group.primaryId !== game.id;
}
export function catalogBrowseAliases(id: string): string[] {
  const group = groupsById.get(id);
  return group?.decision === "group_names" && group.primaryId === id ? group.catalogIds : [];
}
export function isPendingCatalogGame(game: Pick<ReviewGame, "platformSlug" | "regionalStatus">): boolean {
  return ["ps1", "ps2"].includes(game.platformSlug) && game.regionalStatus === "review";
}
export function isDefaultCatalogGame(game: ReviewGame): boolean {
  return !isGroupedCatalogName(game) && !isPendingCatalogGame(game);
}
export function pendingEditionForGame(game: Pick<ReviewGame, "title">): Exclude<PendingEdition, "all"> {
  if (/\[platinum\]/i.test(game.title)) return "platinum";
  if (/\[greatest hits\]/i.test(game.title)) return "greatest-hits";
  if (/\[long box\]/i.test(game.title)) return "long-box";
  return "other";
}
export function parsePendingEdition(value: string | null | undefined): PendingEdition {
  return PENDING_EDITION_OPTIONS.find((option) => option.value === value)?.value ?? "all";
}
export function catalogReviewCounts(games: ReviewGame[]): CatalogReviewCounts {
  const counts: CatalogReviewCounts = { documented: 0, pending: 0, groupedNames: 0, variants: { platinum: 0, "greatest-hits": 0, "long-box": 0, other: 0 } };
  for (const game of games) {
    if (isGroupedCatalogName(game)) { counts.groupedNames++; continue; }
    if (isPendingCatalogGame(game)) {
      counts.pending++;
      counts.variants[pendingEditionForGame(game)]++;
    } else counts.documented++;
  }
  return counts;
}
