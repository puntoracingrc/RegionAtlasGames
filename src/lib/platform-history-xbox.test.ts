import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import internalXboxData from "../../data/research/platform-history/internal-candidates-xbox.json";
import xboxPeopleData from "../../data/research/platform-history/people-xbox-public.json";
import { buildCompanyProfileView } from "./company-profile";
import { getCompanyPlatformHistoryLinks, getPlatformHardwareGroup, getPlatformHistory } from "./platform-history";
import { getPersonPublicSource, getPublicPersonSlugs, getPublicPersonView } from "./person-public-research";
import type { PersonPublicOverlayData } from "./person-research-types";

const people = xboxPeopleData as unknown as PersonPublicOverlayData;
const internal = internalXboxData as {
  peopleCandidates: { personSlug: string; status: string }[];
  creditCandidates: { title: string; status: string }[];
  mediaReferences: { personSlug: string; status: string }[];
};

test("publishes the original Xbox as a complete platform history", () => {
  const history = getPlatformHistory("xbox");
  assert.ok(history);
  assert.equal(history.title, "Xbox");
  assert.equal(history.figures.length, 5);
  assert.equal(history.architecture?.length, 5);
  assert.equal(history.companies.length, 12);
  assert.equal(history.gameGroups?.flatMap((group) => group.games).length, 15);
  assert.equal(history.hardware.length, 3);
  assert.equal(history.services?.length, 1);
  assert.ok((history.historyParagraphsEs?.length ?? 0) >= 5);
  assert.deepEqual(history.sectionOrder, [
    "editorial:origin", "figures", "architecture", "hardware", "companies",
    "editorial:acquisitions", "services", "editorial:xbox-live", "games", "milestones", "legacy",
  ]);
});

test("resolves every public Xbox relation and source", () => {
  const history = getPlatformHistory("xbox");
  assert.ok(history);
  const publicPeople = new Set(getPublicPersonSlugs());
  const sourceIds = new Set(history.sources.map((source) => source.id));
  const assertSources = (ids: string[]) => ids.forEach((id) => assert.ok(sourceIds.has(id), id));
  history.figures.forEach((figure) => {
    assert.ok(publicPeople.has(figure.personSlug), figure.personSlug);
    assert.ok(getPublicPersonView(figure.personSlug), figure.personSlug);
    assertSources(figure.sourceIds);
  });
  history.architecture?.forEach((item) => assertSources(item.sourceIds));
  history.companies.forEach((company) => {
    assert.ok(buildCompanyProfileView(company.companySlug), company.companySlug);
    assert.ok(getCompanyPlatformHistoryLinks(company.companySlug).some((link) => link.platformSlug === "xbox"));
    assertSources(company.sourceIds);
  });
  history.gameGroups?.flatMap((group) => group.games).forEach((game) => {
    game.companySlugs.forEach((slug) => assert.ok(buildCompanyProfileView(slug), slug));
    assertSources(game.sourceIds);
  });
  history.hardware.forEach((item) => assertSources(item.sourceIds));
  history.services?.forEach((item) => assertSources(item.sourceIds));
  history.editorialSections?.forEach((section) => {
    assertSources(section.sourceIds);
    section.cards.forEach((card) => assertSources(card.sourceIds));
  });
  history.milestones.forEach((item) => assertSources(item.sourceIds));
});

test("models dated ownership without confusing external partners", () => {
  const history = getPlatformHistory("xbox");
  assert.ok(history);
  const companies = new Map(history.companies.map((company) => [company.companySlug, company]));
  assert.equal(companies.get("bungie")?.relationshipStart, "2000-06-19");
  assert.equal(companies.get("bungie")?.relationshipEnd, "2007");
  assert.equal(companies.get("rare")?.relationshipStart, "2002-09-24");
  assert.equal(companies.get("rare")?.relationshipEnd, null);
  assert.equal(companies.get("lionhead-studios")?.relationshipType, "KEY_DEVELOPER");
  assert.match(companies.get("lionhead-studios")?.period ?? "", /Independiente durante Fable/i);
  assert.equal(companies.get("bioware")?.relationshipType, "KEY_DEVELOPER");
});

test("keeps Xbox Live and both controllers historically distinct", () => {
  const history = getPlatformHistory("xbox");
  assert.ok(history);
  const live = history.services?.find((service) => service.id === "service-xbox-live");
  assert.match(live?.launchedLabel ?? "", /15 nov 2002/i);
  assert.doesNotMatch(live?.launchedLabel ?? "", /2001/);
  assert.equal(getPlatformHardwareGroup("xbox", "hardware-xbox-duke"), "controllers");
  assert.match(history.hardware.find((item) => item.id === "hardware-xbox-controller-s")?.summaryEs ?? "", /Xbox 360/i);
});

test("publishes backed people and retains incomplete identities internally", () => {
  assert.equal(people.profiles?.length, 5);
  assert.equal(people.historicalRelations?.length, 5);
  people.profiles?.forEach((profile) => assert.ok(getPublicPersonView(profile.slug), profile.slug));
  const referenced = new Set<string>();
  for (const rows of [people.companyRelations ?? [], people.positions ?? [], people.relatedWorks ?? [], people.historicalRelations ?? []]) {
    rows.forEach((row) => referenced.add(row.sourceId));
  }
  people.profiles?.forEach((profile) => profile.sourceIds.forEach((id) => referenced.add(id)));
  referenced.forEach((id) => assert.ok(getPersonPublicSource(id), id));
  const publicPeople = new Set(getPublicPersonSlugs());
  internal.peopleCandidates.forEach((candidate) => assert.equal(publicPeople.has(candidate.personSlug), false, candidate.personSlug));
  assert.ok(internal.creditCandidates.some((candidate) => candidate.title.includes("Jade Raymond")));
  const fallback = new Set(internal.mediaReferences.map((item) => item.personSlug));
  people.profiles?.forEach((profile) => {
    if (!profile.portrait) assert.ok(fallback.has(profile.slug), profile.slug);
  });
  const loader = readFileSync("src/lib/person-public-research.ts", "utf8");
  assert.doesNotMatch(loader, /internal-candidates-xbox\.json/);
});
