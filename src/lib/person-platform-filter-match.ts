import type {
  PersonPlatformBrand,
  PersonPlatformFilterGroup,
} from "./person-platform-filters";
import type { PersonCardData } from "./person-research-types";

export function personMatchesPlatformFilters(
  person: PersonCardData,
  brand: "all" | PersonPlatformBrand,
  platformSlug: "all" | string,
  groups: PersonPlatformFilterGroup[],
): boolean {
  if (platformSlug !== "all") return person.platformSlugs.includes(platformSlug);
  if (brand === "all") return true;
  const platformSlugs = groups
    .find((group) => group.brand === brand)
    ?.platforms.map((platform) => platform.slug);
  if (!platformSlugs) return false;
  return person.platformSlugs.some((slug) => platformSlugs.includes(slug));
}
