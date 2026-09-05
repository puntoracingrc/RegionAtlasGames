import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import companyEntitiesData from "../../data/index/company-entities.json";
import companiesData from "../../data/index/companies.json";
import companyProfilesData from "../../data/company-profiles.json";
import coreData from "../../data/research/company-study/core.json";
import manifestData from "../../data/research/company-study/manifest.json";
import publicData from "../../data/research/company-study/public.json";
import relationshipDecisionsData from "../../data/research/company-study/relationship-decisions.json";
import reviewData from "../../data/research/company-study/review.json";
import {
  applyPublicCompanyResearch,
  getPublicCompanyAchievements,
  getPublicCompanyResearchProfileSlugs,
  getPublicCompanyResearchSources,
} from "./company-public-research";
import type {
  CompanyResearchCore,
  CompanyResearchManifest,
  CompanyResearchPublicData,
} from "./company-research-types";
import type { CompanyProfile, IndexEntry } from "./types";

const manifest = manifestData as CompanyResearchManifest;
const core = (coreData as { records: CompanyResearchCore[] }).records;
const review = reviewData as {
  records: { slug: string }[];
  qidCollisionGroups: { qid: string; slugs: string[] }[];
  individualCreatorSlugs: string[];
  compositeCreditSlugs: string[];
};
const publicResearch = publicData as CompanyResearchPublicData;
const profiles = companyProfilesData as Record<string, CompanyProfile>;
const companies = companiesData as Record<string, IndexEntry>;
const companyEntities = companyEntitiesData as {
  slugToCanonical: Record<string, string>;
};

function sha256File(relativePath: string): string {
  return createHash("sha256")
    .update(readFileSync(path.join(process.cwd(), relativePath)))
    .digest("hex");
}

test("partitions all companies into the exact approved and blocked groups", () => {
  assert.equal(core.length, 1400);
  assert.equal(review.records.length, 2926);
  assert.equal(core.length + review.records.length, 4326);
  assert.equal(new Set(core.map((record) => record.slug)).size, 1400);
  assert.equal(new Set(review.records.map((record) => record.slug)).size, 2926);
  assert.equal(
    core.some((record) => review.records.some((blocked) => blocked.slug === record.slug)),
    false,
  );
});

test("publishes only the authorized histories, achievements and QID corrections", () => {
  const histories = publicResearch.profiles.filter((profile) => profile.history);
  const corrections = publicResearch.profiles.filter((profile) => profile.identityCorrection);

  assert.deepEqual(
    histories.map((profile) => profile.slug).sort(),
    ["capcom", "konami", "nintendo", "sega"],
  );
  assert.deepEqual(
    corrections.map((profile) => profile.slug).sort(),
    ["adk", "capcom", "sims"],
  );
  assert.equal(publicResearch.achievements.length, 7);
  assert.deepEqual(getPublicCompanyResearchProfileSlugs(), [
    "adk",
    "capcom",
    "konami",
    "nintendo",
    "sega",
    "sims",
  ]);
});

test("every published history and achievement exposes its approved source", () => {
  const sourceById = new Map(publicResearch.sources.map((source) => [source.id, source]));
  for (const profile of publicResearch.profiles) {
    if (!profile.history) continue;
    assert.ok(profile.history.sourceIds.length > 0);
    for (const sourceId of profile.history.sourceIds) {
      assert.equal(sourceById.get(sourceId)?.verifiedPrimary, true);
    }
  }
  for (const achievement of publicResearch.achievements) {
    assert.equal(sourceById.get(achievement.sourceId)?.verifiedPrimary, true);
    assert.ok(getPublicCompanyResearchSources(achievement.companySlug).some(
      (source) => source.id === achievement.sourceId,
    ));
  }
});

test("applies the three verified identities without exposing other internal fields", () => {
  const expected = {
    adk: "Q2634015",
    capcom: "Q14428",
    sims: "Q4048789",
  };

  for (const [slug, qid] of Object.entries(expected)) {
    const result = applyPublicCompanyResearch(profiles[slug], slug);
    assert.equal(result?.wikidataId, qid);
    assert.equal("countries" in (result ?? {}), false);
    assert.equal("researchConfidence" in (result ?? {}), false);
  }
  assert.match(applyPublicCompanyResearch(profiles.capcom, "capcom")?.history ?? "", /I\.R\.M\./);
  assert.equal(getPublicCompanyAchievements("adk").length, 0);
});

test("shared QIDs retain every catalog slug and never alter canonical mappings", () => {
  assert.equal(review.qidCollisionGroups.length, 259);
  const affectedSlugs = new Set(review.qidCollisionGroups.flatMap((group) => group.slugs));
  assert.equal(affectedSlugs.size, 576);
  for (const slug of affectedSlugs) assert.ok(companies[slug], `Missing company slug ${slug}`);
  assert.equal(manifest.counts.qidCollisionGroups, 259);
  assert.equal(manifest.protectedFileHashes["data/index/company-entities.json"], sha256File("data/index/company-entities.json"));
  assert.ok(Object.keys(companyEntities.slugToCanonical).length > 0);
});

test("keeps personal and composite credits blocked", () => {
  assert.equal(review.individualCreatorSlugs.length, 12);
  assert.equal(review.compositeCreditSlugs.length, 383);
  const blockedSlugs = new Set(review.records.map((record) => record.slug));
  for (const slug of review.individualCreatorSlugs) assert.ok(blockedSlugs.has(slug));
  for (const slug of review.compositeCreditSlugs) assert.ok(blockedSlugs.has(slug));
});

test("does not import corporate relationships and explicitly excludes Shaba and Artoon", () => {
  const decisions = relationshipDecisionsData as {
    importedRelationships: unknown[];
    externallyVerifiedExclusions: {
      companySlug: string;
      replacementImported: boolean;
    }[];
  };
  assert.equal(decisions.importedRelationships.length, 0);
  assert.deepEqual(
    decisions.externallyVerifiedExclusions.map((item) => item.companySlug).sort(),
    ["artoon", "shaba-games"],
  );
  assert.ok(decisions.externallyVerifiedExclusions.every((item) => !item.replacementImported));
});

test("preserves every protected canonical file byte for byte", () => {
  for (const [relativePath, expectedHash] of Object.entries(manifest.protectedFileHashes)) {
    assert.equal(sha256File(relativePath), expectedHash, relativePath);
  }
  assert.deepEqual(
    manifest.protectedFileHashUpdates?.map((update) => update.batchId),
    ["company-credit-verified-batch-1", "company-credit-ps4-pal-batch-1"],
  );
});

test("keeps internal research out of public route and sitemap module graphs", () => {
  const publicRoute = readFileSync("src/app/api/catalog/companies/route.ts", "utf-8");
  const sitemap = readFileSync("src/app/sitemap.ts", "utf-8");
  const publicProfileLoader = readFileSync("src/lib/company-public-research.ts", "utf-8");

  assert.doesNotMatch(publicRoute, /company-research-core|admin-company-research/);
  assert.doesNotMatch(sitemap, /company-research|investigacion/);
  assert.doesNotMatch(publicProfileLoader, /core\.json|review\.json|provenance\.json|sources\.json/);
});
