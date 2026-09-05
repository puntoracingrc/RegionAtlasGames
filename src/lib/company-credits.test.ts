import assert from "node:assert/strict";
import test from "node:test";
import {
  companyCreditsForRole,
  resolveGameCompanyCredits,
} from "./company-credits";
import type {
  DetailEntity,
  GameCompanyCredit,
  GameCompanyCreditRole,
} from "./types";

function entity(name: string, slug: string): DetailEntity {
  return {
    name,
    slug,
    museumPath: null,
    pcPath: null,
    source: "research",
  };
}

function credit(
  role: GameCompanyCreditRole,
  company: DetailEntity,
): GameCompanyCredit {
  return {
    role,
    company,
    provenance: {
      source: "research",
      evidenceUrls: ["https://example.com/evidence"],
      evidenceSummary: "Evidencia revisada para la prueba.",
      reviewedAt: "2026-09-05",
      reviewBatch: "test",
    },
  };
}

test("keeps developer, publisher, digital publisher and physical distributor separate", () => {
  const developerA = entity("Developer A", "developer-a");
  const developerB = entity("Developer B", "developer-b");
  const publisher = entity("Publisher", "publisher");
  const distributor = entity("Publisher", "publisher");

  const credits = resolveGameCompanyCredits({
    developer: entity("Legacy developer", "legacy-developer"),
    publisher,
    companyCredits: [
      credit("developer", developerA),
      credit("developer", developerB),
      credit("digitalPublisher", publisher),
      credit("physicalPublisherOrDistributor", distributor),
    ],
  });

  assert.deepEqual(
    companyCreditsForRole(
      { developer: null, publisher: null, companyCredits: credits },
      "developer",
    ).map((item) => item.company.slug),
    ["developer-a", "developer-b"],
  );
  assert.equal(credits.some((item) => item.company.slug === "legacy-developer"), false);
  assert.equal(credits.filter((item) => item.company.slug === "publisher").length, 2);
  assert.deepEqual(
    credits
      .filter((item) => item.company.slug === "publisher")
      .map((item) => item.role),
    ["digitalPublisher", "physicalPublisherOrDistributor"],
  );
});

test("deduplicates only an exact company and role pair", () => {
  const studio = entity("Studio", "studio");
  const duplicated = credit("developer", studio);
  const credits = resolveGameCompanyCredits({
    developer: null,
    publisher: null,
    companyCredits: [
      duplicated,
      duplicated,
      credit("physicalPublisherOrDistributor", studio),
    ],
  });

  assert.deepEqual(
    credits.map((item) => `${item.role}:${item.company.slug}`),
    ["developer:studio", "physicalPublisherOrDistributor:studio"],
  );
});

test("a role-specific historical credit suppresses the matching legacy family", () => {
  const credits = resolveGameCompanyCredits({
    developer: entity("Legacy developer", "legacy-developer"),
    publisher: entity("Legacy publisher", "legacy-publisher"),
    companyCredits: [
      credit("originalDeveloper", entity("Original studio", "original-studio")),
      credit("portDeveloper", entity("Port studio", "port-studio")),
      credit("originalPublisher", entity("Original publisher", "original-publisher")),
      credit("regionalPublisher", entity("Regional publisher", "regional-publisher")),
    ],
  });

  assert.equal(credits.some((item) => item.company.slug === "legacy-developer"), false);
  assert.equal(credits.some((item) => item.company.slug === "legacy-publisher"), false);
  assert.deepEqual(
    credits.map((item) => item.role),
    ["originalDeveloper", "portDeveloper", "originalPublisher", "regionalPublisher"],
  );
});
