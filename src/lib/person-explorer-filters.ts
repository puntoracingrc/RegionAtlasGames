import { personMatchesPlatformFilters } from "./person-platform-filter-match";
import type {
  PersonPlatformBrand,
  PersonPlatformFilterGroup,
} from "./person-platform-filters";
import type {
  PersonExpertise,
  PersonExpertiseFilterOption,
} from "./person-expertise";
import type { PersonCardData } from "./person-research-types";

export type PersonExplorerSort = "name" | "birth";

export type PersonExplorerFilterState = {
  query: string;
  expertise: "all" | PersonExpertise;
  brand: "all" | PersonPlatformBrand;
  platformSlug: "all" | string;
  sort: PersonExplorerSort;
};

export const DEFAULT_PERSON_EXPLORER_FILTERS: PersonExplorerFilterState = {
  query: "",
  expertise: "all",
  brand: "all",
  platformSlug: "all",
  sort: "name",
};

const PERSON_FILTER_PARAMS = ["q", "especialidad", "marca", "plataforma", "orden"] as const;

function normalize(value: string): string {
  return value.toLocaleLowerCase("es").normalize("NFD").replace(/\p{M}/gu, "");
}

export function parsePersonExplorerFilters(
  params: Pick<URLSearchParams, "get">,
  expertiseOptions: PersonExpertiseFilterOption[],
  platformGroups: PersonPlatformFilterGroup[],
): PersonExplorerFilterState {
  const requestedExpertise = params.get("especialidad");
  const expertise = expertiseOptions.some((option) => option.value === requestedExpertise)
    ? requestedExpertise as PersonExpertise
    : "all";
  const requestedBrand = params.get("marca");
  const selectedGroup = platformGroups.find((group) => group.brand === requestedBrand);
  const requestedPlatform = params.get("plataforma");
  const platformSlug = selectedGroup?.platforms.some(
    (platform) => platform.slug === requestedPlatform,
  )
    ? requestedPlatform as string
    : "all";

  return {
    query: params.get("q") ?? "",
    expertise,
    brand: selectedGroup?.brand ?? "all",
    platformSlug,
    sort: params.get("orden") === "nacimiento" ? "birth" : "name",
  };
}

export function serializePersonExplorerFilters(
  currentParams: URLSearchParams,
  filters: PersonExplorerFilterState,
): URLSearchParams {
  const params = new URLSearchParams(currentParams);
  for (const key of PERSON_FILTER_PARAMS) params.delete(key);
  if (filters.query.trim()) params.set("q", filters.query);
  if (filters.expertise !== "all") params.set("especialidad", filters.expertise);
  if (filters.brand !== "all") params.set("marca", filters.brand);
  if (filters.platformSlug !== "all") params.set("plataforma", filters.platformSlug);
  if (filters.sort === "birth") params.set("orden", "nacimiento");
  return params;
}

export function filterPersonCards(
  people: PersonCardData[],
  filters: PersonExplorerFilterState,
  platformGroups: PersonPlatformFilterGroup[],
): PersonCardData[] {
  const normalizedQuery = normalize(filters.query.trim());
  return people
    .filter((person) => !normalizedQuery || person.searchHaystack.includes(normalizedQuery))
    .filter(
      (person) =>
        filters.expertise === "all" || person.expertise.includes(filters.expertise),
    )
    .filter((person) =>
      personMatchesPlatformFilters(
        person,
        filters.brand,
        filters.platformSlug,
        platformGroups,
      ),
    )
    .sort((a, b) => {
      if (filters.sort === "birth") {
        const aYear = Number(a.lifeLabel?.match(/\d{4}/)?.[0] ?? 9999);
        const bYear = Number(b.lifeLabel?.match(/\d{4}/)?.[0] ?? 9999);
        return aYear - bYear || a.name.localeCompare(b.name, "es");
      }
      return a.name.localeCompare(b.name, "es", { numeric: true });
    });
}
