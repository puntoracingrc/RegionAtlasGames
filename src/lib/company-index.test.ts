import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_COMPANY_FILTERS,
  filterCompanies,
  type CompanyCardData,
  type CompanyIndexFilters,
} from "./company-index";

function company(overrides: Partial<CompanyCardData> = {}): CompanyCardData {
  const name = overrides.name ?? "Compañía";
  return {
    slug: name.toLowerCase().replaceAll(" ", "-"),
    name,
    catalogEntryCount: 1,
    developerCatalogEntryCount: 0,
    publisherCatalogEntryCount: 1,
    roleKind: "publisher",
    platformSlugs: ["ps4"],
    platformPreview: "PS4 (1 ficha)",
    genreSlugs: ["accion"],
    marketScore: 0,
    medianPrice: null,
    highValueCatalogEntryCount: 0,
    pricedCatalogEntryCount: 0,
    firstReleaseYear: 2018,
    latestReleaseYear: 2018,
    activityPeriods: ["2010s"],
    companyStatus: "unknown",
    hasProfile: false,
    logoUrl: null,
    logoIsProvisional: true,
    searchHaystack: name.toLowerCase(),
    ...overrides,
  };
}

function filters(overrides: Partial<CompanyIndexFilters> = {}): CompanyIndexFilters {
  return { ...DEFAULT_COMPANY_FILTERS, ...overrides };
}

test("uses alphabetical order by default", () => {
  const result = filterCompanies(
    [company({ name: "Zeta" }), company({ name: "Ábaco" }), company({ name: "Beta" })],
    filters(),
  );

  assert.deepEqual(result.map((item) => item.name), ["Ábaco", "Beta", "Zeta"]);
});

test("searches names without making accents significant", () => {
  const result = filterCompanies(
    [
      company({ name: "Compañía Ábaco", searchHaystack: "compania abaco" }),
      company({ name: "Estudio Beta", searchHaystack: "estudio beta" }),
    ],
    filters({ q: "compañía ábaco" }),
  );

  assert.deepEqual(result.map((item) => item.name), ["Compañía Ábaco"]);
});

test("role filters include dual-role companies", () => {
  const publisher = company({ name: "Publisher", roleKind: "publisher" });
  const developer = company({ name: "Developer", roleKind: "developer" });
  const both = company({ name: "Both", roleKind: "both" });

  assert.deepEqual(
    filterCompanies([publisher, developer, both], filters({ role: "publishers" })).map(
      (item) => item.name,
    ),
    ["Both", "Publisher"],
  );
  assert.deepEqual(
    filterCompanies([publisher, developer, both], filters({ role: "developers" })).map(
      (item) => item.name,
    ),
    ["Both", "Developer"],
  );
});

test("catalog-size bands have exact non-overlapping boundaries", () => {
  const companies = [4, 5, 19, 20, 49, 50, 199, 200].map((catalogEntryCount) =>
    company({ name: `Company ${catalogEntryCount}`, catalogEntryCount }),
  );

  assert.deepEqual(
    filterCompanies(companies, filters({ size: "small" }))
      .map((item) => item.catalogEntryCount)
      .sort((a, b) => a - b),
    [5, 19],
  );
  assert.deepEqual(
    filterCompanies(companies, filters({ size: "large" }))
      .map((item) => item.catalogEntryCount)
      .sort((a, b) => a - b),
    [50, 199],
  );
  assert.deepEqual(
    filterCompanies(companies, filters({ size: "major" })).map((item) => item.catalogEntryCount),
    [200],
  );
});

test("advanced filters combine status, activity and price coverage", () => {
  const match = company({
    name: "Match",
    companyStatus: "defunct",
    activityPeriods: ["1990s", "2000s"],
    pricedCatalogEntryCount: 3,
  });
  const wrongStatus = company({
    name: "Active",
    companyStatus: "active",
    activityPeriods: ["1990s"],
    pricedCatalogEntryCount: 3,
  });
  const wrongPeriod = company({
    name: "Eighties",
    companyStatus: "defunct",
    activityPeriods: ["1980s"],
    pricedCatalogEntryCount: 3,
  });

  const result = filterCompanies(
    [wrongStatus, wrongPeriod, match],
    filters({ status: "defunct", activity: "1990s", market: "priced" }),
  );

  assert.deepEqual(result.map((item) => item.name), ["Match"]);
});

test("economic and recent sorts use their displayed metrics", () => {
  const older = company({
    name: "Older",
    marketScore: 500,
    medianPrice: 90,
    highValueCatalogEntryCount: 4,
    pricedCatalogEntryCount: 5,
    latestReleaseYear: 2005,
  });
  const newer = company({
    name: "Newer",
    marketScore: 800,
    medianPrice: 40,
    highValueCatalogEntryCount: 2,
    pricedCatalogEntryCount: 20,
    latestReleaseYear: 2025,
  });

  assert.equal(filterCompanies([older, newer], filters({ sort: "market-desc" }))[0].name, "Newer");
  assert.equal(filterCompanies([older, newer], filters({ sort: "median-desc" }))[0].name, "Older");
  assert.equal(filterCompanies([older, newer], filters({ sort: "grails-desc" }))[0].name, "Older");
  assert.equal(filterCompanies([older, newer], filters({ sort: "recent-desc" }))[0].name, "Newer");
});
