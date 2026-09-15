import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import internalData from "../../data/research/platform-history/internal-candidates-xbox360.json";
import peopleData from "../../data/research/platform-history/people-xbox360-public.json";
import { buildCompanyProfileView } from "./company-profile";
import { getCompanyPlatformHistoryLinks, getPlatformHardwareGroup, getPlatformHistory } from "./platform-history";
import { getPersonPublicSource, getPublicPersonSlugs, getPublicPersonView } from "./person-public-research";
import type { PersonPublicOverlayData } from "./person-research-types";

const people = peopleData as unknown as PersonPublicOverlayData;
const internal = internalData as { peopleCandidates: { personSlug: string }[]; mediaReferences: { personSlug: string }[] };

test("publishes Xbox 360 with hardware, services and dated history", () => {
  const history = getPlatformHistory("xbox360");
  assert.ok(history);
  assert.equal(history.figures.length, 6);
  assert.equal(history.architecture?.length, 4);
  assert.equal(history.companies.length, 16);
  assert.equal(history.gameGroups?.flatMap((group) => group.games).length, 22);
  assert.equal(history.hardware.length, 9);
  assert.equal(history.services?.length, 4);
  assert.equal(history.compatibilityLinks?.length, 1);
  assert.equal(history.milestones.length, 10);
});

test("keeps commercial models, controller and Kinect in their correct groups", () => {
  const history = getPlatformHistory("xbox360");
  assert.ok(history);
  const hardware = new Map(history.hardware.map((item) => [item.id, item]));
  assert.equal(hardware.get("hardware-x360-s")?.kind, "REDESIGN");
  assert.equal(hardware.get("hardware-x360-e")?.kind, "REDESIGN");
  assert.match(hardware.get("hardware-x360-e")?.summaryEs ?? "", /sin cambiar de generación/i);
  assert.equal(getPlatformHardwareGroup("xbox360", "hardware-x360-controller"), "controllers");
  assert.equal(getPlatformHardwareGroup("xbox360", "hardware-x360-kinect"), "peripherals");
  assert.match(hardware.get("hardware-x360-kinect")?.summaryEs ?? "", /no es una consola/i);
});

test("models Bungie separation and protects external studios", () => {
  const history = getPlatformHistory("xbox360");
  assert.ok(history);
  const companies = new Map(history.companies.map((item) => [item.companySlug, item]));
  assert.equal(companies.get("bungie")?.relationshipEnd, "2007");
  assert.equal(companies.get("epic-games")?.relationshipType, "STRATEGIC_THIRD_PARTY");
  assert.equal(companies.get("bioware")?.relationshipType, "STRATEGIC_THIRD_PARTY");
  assert.equal(companies.get("remedy-entertainment")?.relationshipType, "KEY_DEVELOPER");
  assert.equal(companies.get("rare")?.relationshipType, "FIRST_PARTY");
  assert.equal(history.genealogies.find((item) => item.id === "PHGEN-X360-BUNGIE-2007")?.relationshipType, "BECAME_INDEPENDENT");
  const games = new Map(history.gameGroups?.flatMap((group) => group.games).map((game) => [game.title, game]));
  assert.equal(games.get("Halo: Reach")?.relationshipType, "INDEPENDENT_PARTNER");
  assert.equal(games.get("Gears of War")?.relationshipType, "INDEPENDENT_PARTNER");
});

test("keeps dated figures and official sales claims bounded", () => {
  const history = getPlatformHistory("xbox360");
  assert.ok(history);
  assert.match(history.summaryParagraphsEs.join(" "), /más de 84 millones.*2014/i);
  assert.doesNotMatch(history.historyParagraphsEs?.join(" ") ?? "", /tasa exacta global/i);
  assert.match(history.editorialSections?.find((item) => item.id === "red-ring")?.paragraphsEs.join(" ") ?? "", /no se publica una tasa global/i);
  assert.match(history.services?.find((item) => item.id === "service-x360-achievements")?.summaryEs ?? "", /Gamerscore/i);
});

test("resolves all Xbox 360 public links and keeps candidates internal", () => {
  const history = getPlatformHistory("xbox360");
  assert.ok(history);
  const publicPeople = new Set(getPublicPersonSlugs());
  const sourceIds = new Set(history.sources.map((source) => source.id));
  const assertSources = (ids: string[]) => ids.forEach((id) => assert.ok(sourceIds.has(id), id));
  history.figures.forEach((figure) => {
    assert.ok(publicPeople.has(figure.personSlug), figure.personSlug);
    assert.ok(getPublicPersonView(figure.personSlug));
    assertSources(figure.sourceIds);
  });
  history.architecture?.forEach((item) => assertSources(item.sourceIds));
  history.companies.forEach((company) => {
    assert.ok(buildCompanyProfileView(company.companySlug), company.companySlug);
    assert.ok(getCompanyPlatformHistoryLinks(company.companySlug).some((link) => link.platformSlug === "xbox360"));
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
  history.compatibilityLinks?.forEach((item) => assertSources(item.sourceIds));
  history.milestones.forEach((item) => assertSources(item.sourceIds));
  people.profiles?.forEach((profile) => assert.ok(getPublicPersonView(profile.slug)));
  const personSourceIds = new Set<string>();
  for (const rows of [people.companyRelations ?? [], people.positions ?? [], people.relatedWorks ?? [], people.historicalRelations ?? []]) rows.forEach((row) => personSourceIds.add(row.sourceId));
  people.profiles?.forEach((profile) => profile.sourceIds.forEach((id) => personSourceIds.add(id)));
  personSourceIds.forEach((id) => assert.ok(getPersonPublicSource(id), id));
  internal.peopleCandidates.forEach((candidate) => assert.equal(publicPeople.has(candidate.personSlug), false));
  const fallback = new Set(internal.mediaReferences.map((item) => item.personSlug));
  people.profiles?.forEach((profile) => { if (!profile.portrait) assert.ok(fallback.has(profile.slug), profile.slug); });
  assert.doesNotMatch(readFileSync("src/lib/person-public-research.ts", "utf8"), /internal-candidates-xbox360\.json/);
});

test("uses the latest completed ownership event for company status", () => {
  const bungie = buildCompanyProfileView("bungie");
  assert.ok(bungie);
  assert.equal(bungie.acquiredByCompany?.slug, "sony-interactive-entertainment");
  assert.ok(bungie.historicalGenealogy.some((event) => event.relationshipType === "BECAME_INDEPENDENT" && event.year === 2007));
});
