import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildAwardPublicData, type AwardBuildContext } from "./award-domain";
import type { AwardResearchData } from "./award-research-types";
import { createAwardQueries } from "./award-public-research";

// Synthetic entities intentionally do not assert historical awards or production counts.
function fixture(): { data: AwardResearchData; context: AwardBuildContext } {
  return {
    data: {
      version: 1, reviewedAt: "2026-09-06",
      series: [{ id: "s", slug: "test-awards", canonicalName: "Test awards", shortName: null, organizer: null, foundedYear: null, scope: null, officialUrl: "https://example.org/awards", descriptionEs: null, selectionModel: null, specialization: null, active: true, sourceIds: ["src"] }],
      editions: [{ id: "e", seriesSlug: "test-awards", editionYear: 2022, editionNumber: null, ceremonyDate: null, eligibilityPeriod: null, venue: null, city: null, status: "completed", officialUrl: null, sourceIds: ["src"] }],
      categories: [{ id: "c", seriesSlug: "test-awards", slug: "game-of-the-year", canonicalName: "Game of the Year", displayName: "Game of the Year", categoryType: "top_game", prestigeGroup: "major_global", activeFrom: null, activeTo: null, previousNames: [], successorCategoryId: null, sourceIds: ["src"] }],
      results: [{ id: "r", editionId: "e", seriesSlug: "test-awards", categoryId: "c", resultType: "winner", officialLabel: null, shared: false, recipients: [{ type: "game", workKey: "audited-work", displayName: "Test game" }], sourceIds: ["src"], confidence: "HIGH", verificationStatus: "VERIFIED", publicationStatus: "published" }],
      workLinks: [{ id: "w", workKey: "audited-work", displayName: "Test game", catalogIdsVerified: ["edition-es", "edition-us"], sourceIds: ["src"], verificationStatus: "VERIFIED" }],
      personWorkLinks: [{ id: "pw", personWorkId: "credit", catalogWorkKey: "audited-work", sourceIds: ["src"], verificationStatus: "VERIFIED" }],
      companyWorkLinks: [{ id: "cw", companySlug: "studio", workKey: "audited-work", role: "developer", catalogId: "edition-es", sourceIds: ["src"], verificationStatus: "VERIFIED" }],
      legacyLinks: [], sources: [{ id: "src", url: "https://example.org/awards/2022", title: "Official fixture", retrievedAt: "2026-09-06", verifiedPrimary: true, evidenceSummary: "Synthetic fixture evidence" }],
    },
    context: { approved: new Set(["series:s", "edition:e", "category:c", "result:r", "work:w", "personWork:pw", "companyWork:cw"]), catalogWorkKeys: new Map([["edition-es", "audited-work"], ["edition-us", "audited-work"]]), publicPeople: new Map([["person", "Q1"]]), companies: new Set(["studio", "parent"]), exactCredits: new Map([["credit", { personSlug: "person", role: "Supervisor", sourceId: "src", relationshipPrecision: "EXACT_EDITORIAL_CREDIT" }]]), legacyAwards: new Map() },
  };
}
const build = () => { const { data, context } = fixture(); return buildAwardPublicData(data, context).publicData; };

test("deterministic build preserves input and has no internal result fields", () => {
  const { data, context } = fixture(); const before = structuredClone(data);
  assert.deepEqual(buildAwardPublicData(data, context), buildAwardPublicData(data, context));
  assert.deepEqual(data, before);
  assert.equal("publicationStatus" in build().results[0], false);
});
test("only referenced sources are exported", () => {
  const { data, context } = fixture(); data.sources.push({ ...data.sources[0], id: "private-source" });
  assert.deepEqual(buildAwardPublicData(data, context).publicData.sources.map(s => s.id), ["src"]);
});
test("game award is contextual, never a personal award, and role stays exact", () => {
  const q = createAwardQueries(build());
  assert.equal(q.getDirectAwardsForPerson("person").length, 0);
  assert.equal(q.getWorkAwardsForPerson("person")[0].role, "Supervisor");
  assert.equal(q.getWorkAwardsForPerson("person")[0].results.length, 1);
});
test("contextual or nonpublic credits cannot create work awards", () => {
  for (const internal of [true, false]) {
    const { data, context } = fixture();
    if (internal) context.publicPeople.clear();
    else context.exactCredits.get("credit")!.relationshipPrecision = "ASSOCIATION_NOT_EXACT_CREDIT";
    assert.equal(buildAwardPublicData(data, context).publicData.personWorkLinks.length, 0);
  }
});
test("direct person awards need the formal matching recipient", () => {
  const { data, context } = fixture(); data.results[0].recipients = [{ type: "person", personSlug: "person", personQid: "Q1", displayName: "Test person" }];
  const q = createAwardQueries(buildAwardPublicData(data, context).publicData);
  assert.equal(q.getDirectAwardsForPerson("person").length, 1);
  assert.equal(q.getAwardsForWorkKey("audited-work").length, 0);
  data.results[0].recipients = [{ type: "person", personSlug: "person", personQid: "Q2", displayName: "Test person" }];
  assert.throws(() => buildAwardPublicData(data, context), /mismatched/);
});
test("unknown person may be named without inventing a public profile", () => {
  const { data, context } = fixture(); data.results[0].recipients = [{ type: "person", personSlug: null, displayName: "Named recipient" }];
  const q = createAwardQueries(buildAwardPublicData(data, context).publicData);
  assert.ok(q.getAwardSitemapEntries().every(p => !p.includes("persona")));
  assert.equal(q.getDirectAwardsForPerson("internal").length, 0);
});
test("developer, publisher, parent and direct company awards remain separate", () => {
  const q = createAwardQueries(build());
  assert.equal(q.getDevelopedGameAwardsForCompany("studio").length, 1);
  assert.equal(q.getPublishedGameAwardsForCompany("studio").length, 0);
  assert.equal(q.getDirectAwardsForCompany("studio").length, 0);
  assert.equal(q.getDevelopedGameAwardsForCompany("parent").length, 0);
});
test("catalog editions do not multiply awards and titles never match", () => {
  const q = createAwardQueries(build());
  assert.equal(q.getAwardsForWorkKey("audited-work").length, 1);
  assert.equal(q.getAwardsForWorkKey("Test game").length, 0);
  assert.equal(q.getAwardsForWorkKey("audited-work-remake").length, 0);
});
test("multiple exact roles preserve labels without multiplying work awards", () => {
  const data = build();
  data.personWorkLinks.push({ ...data.personWorkLinks[0], id: "other-role", personWorkId: "other-credit", role: "Writer" });
  const rows = createAwardQueries(data).getWorkAwardsForPerson("person");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].results.length, 1);
  assert.deepEqual(rows[0].roles, ["Supervisor", "Writer"]);
});
test("winner and nominee stats are distinct, shared recipients are supported", () => {
  const { data, context } = fixture(); data.results[0].shared = true;
  data.results[0].recipients.push({ type: "team", key: "team", displayName: "Shared recipient" });
  const q = createAwardQueries(buildAwardPublicData(data, context).publicData);
  assert.equal(q.getAwardStats(q.getAwardsForWorkKey("audited-work")).wins, 1);
  data.results[0].resultType = "nominee";
  const q2 = createAwardQueries(buildAwardPublicData(data, context).publicData);
  assert.deepEqual(q2.getAwardStats(q2.getAwardsForWorkKey("audited-work")), { wins: 0, nominations: 1, majorTopAwardCount: 0, majorTopAwardOrganizationCount: 0 });
});
test("future winners fail validation without rewriting earlier years", () => {
  const { data, context } = fixture(); data.editions[0].status = "upcoming";
  assert.throws(() => buildAwardPublicData(data, context), /unfinished/);
});
test("unapproved, weak and Wikidata-only results stay internal", () => {
  for (const mode of ["approval", "source", "confidence", "wikidata"] as const) {
    const { data, context } = fixture();
    if (mode === "approval") context.approved.delete("result:r");
    if (mode === "source") data.sources[0].verifiedPrimary = false;
    if (mode === "confidence") data.results[0].confidence = "MEDIUM";
    if (mode === "wikidata") data.sources[0].url = "https://www.wikidata.org/wiki/Q1";
    if (mode === "source" || mode === "wikidata") context.approved.clear();
    assert.equal(buildAwardPublicData(data, context).publicData.results.length, 0);
  }
});
test("internal notes cannot accidentally leak through a public row", () => {
  const { data, context } = fixture();
  Object.assign(data.series[0], { privateReview: "Not public" });
  assert.throws(() => buildAwardPublicData(data, context), /private field/);
});
test("new editions append history and renamed categories retain earlier data", () => {
  const { data, context } = fixture();
  data.editions.push({ ...data.editions[0], id: "e2", editionYear: 2023 });
  data.categories[0].previousNames = ["Historical title"];
  data.results.push({ ...data.results[0], id: "r2", editionId: "e2" });
  context.approved.add("edition:e2"); context.approved.add("result:r2");
  const output = buildAwardPublicData(data, context).publicData;
  assert.deepEqual(output.results.map(r => r.editionId), ["e", "e2"]);
  assert.deepEqual(output.categories[0].previousNames, ["Historical title"]);
});
test("missing references, identities, recipients and duplicate facts fail closed", () => {
  const mutations: ((d: AwardResearchData) => void)[] = [
    d => { d.sources = []; }, d => { d.results[0].recipients = []; },
    d => { d.results[0].editionId = "absent"; }, d => { d.results.push({ ...d.results[0], id: "duplicate" }); },
    d => { d.workLinks[0].catalogIdsVerified.push("unverified-region"); },
    d => { d.editions.push({ ...d.editions[0], id: "other" }); },
  ];
  for (const mutate of mutations) { const { data, context } = fixture(); mutate(data); assert.throws(() => buildAwardPublicData(data, context)); }
});
test("legacy recognition is suppressed only when linked to a public direct result", () => {
  const { data, context } = fixture(); context.legacyAwards.set("legacy", { personSlug: "person" });
  data.legacyLinks.push({ id: "l", legacyAwardId: "legacy", classification: "FORMAL_AWARD_LINKED", resultId: "r" });
  assert.throws(() => buildAwardPublicData(data, context), /recipient mismatch/);
});
test("public query layer imports only the generated award artifact", () => {
  const source = readFileSync("src/lib/award-public-research.ts", "utf8");
  const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(m => m[1]);
  assert.deepEqual(imports.filter(p => p.includes("award-study")), ["../../data/research/award-study/public.json"]);
});
