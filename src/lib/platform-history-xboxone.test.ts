import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import internalData from "../../data/research/platform-history/internal-candidates-xboxone.json";
import peopleData from "../../data/research/platform-history/people-xboxone-public.json";
import { buildCompanyProfileView } from "./company-profile";
import { getCompanyPlatformHistoryLinks, getPlatformHardwareGroup, getPlatformHistory } from "./platform-history";
import { getPersonPublicSource, getPublicPersonSlugs, getPublicPersonView } from "./person-public-research";
import type { PersonPublicOverlayData } from "./person-research-types";

const people = peopleData as unknown as PersonPublicOverlayData;
const internal = internalData as { peopleCandidates: { personSlug: string }[]; mediaReferences: { personSlug: string }[] };

test("publishes Xbox One as a two-stage platform history", () => {
  const history = getPlatformHistory("xboxone");
  assert.ok(history);
  assert.equal(history.figures.length, 5);
  assert.equal(history.architecture?.length, 4);
  assert.equal(history.companies.length, 17);
  assert.equal(history.gameGroups?.flatMap((group) => group.games).length, 18);
  assert.equal(history.hardware.length, 6);
  assert.equal(history.services?.length, 3);
  assert.equal(history.compatibilityLinks?.length, 2);
  assert.equal(history.genealogies.length, 8);
  assert.equal(history.milestones.length, 11);
  assert.match(history.summaryParagraphsEs.join(" "), /no presenta una estimación lifetime/i);
});

test("keeps One X and All-Digital inside the Xbox One family", () => {
  const history = getPlatformHistory("xboxone");
  assert.ok(history);
  const hardware = new Map(history.hardware.map((item) => [item.id, item]));
  assert.equal(hardware.get("hardware-xone-x")?.kind, "MID_GENERATION_UPGRADE");
  assert.match(hardware.get("hardware-xone-x")?.summaryEs ?? "", /media generación/i);
  assert.ok(hardware.get("hardware-xone-x")?.features.some((item) => /No es nueva generación/i.test(item)));
  assert.equal(hardware.get("hardware-xone-s-digital")?.kind, "DIGITAL_ONLY_REDESIGN");
  assert.equal(getPlatformHardwareGroup("xboxone", "hardware-xone-adaptive"), "controllers");
});

test("dates Game Pass and keeps Play Anywhere separate from cloud", () => {
  const history = getPlatformHistory("xboxone");
  assert.ok(history);
  const services = new Map(history.services?.map((item) => [item.id, item]));
  assert.equal(services.get("service-xone-gamepass")?.launchedLabel, "1 jun 2017");
  assert.ok(services.get("service-xone-gamepass")?.features.some((item) => /desde 2018/i.test(item)));
  assert.match(services.get("service-xone-play-anywhere")?.summaryEs ?? "", /Windows 10/i);
  assert.ok(services.get("service-xone-play-anywhere")?.features.some((item) => /No es cloud gaming/i.test(item)));
});

test("protects external studios and acquisition dates", () => {
  const history = getPlatformHistory("xboxone");
  assert.ok(history);
  const companies = new Map(history.companies.map((item) => [item.companySlug, item]));
  for (const slug of ["insomniac-games", "remedy-entertainment", "respawn-entertainment"]) {
    assert.equal(companies.get(slug)?.relationshipType, "STRATEGIC_THIRD_PARTY", slug);
  }
  assert.equal(companies.get("moon-studios")?.relationshipType, "KEY_DEVELOPER");
  assert.equal(companies.get("mojang")?.relationshipStart, "2014-09");
  assert.equal(companies.get("playground-games")?.relationshipStart, "2018");
  assert.equal(companies.get("double-fine-productions")?.relationshipStart, "2019-06");
  assert.match(companies.get("mojang")?.contributionEs ?? "", /multiplataforma/i);
});

test("resolves every Xbox One public relation and source", () => {
  const history = getPlatformHistory("xboxone");
  assert.ok(history);
  const publicPeople = new Set(getPublicPersonSlugs());
  const sourceIds = new Set(history.sources.map((source) => source.id));
  const assertSources = (ids: string[]) => ids.forEach((id) => assert.ok(sourceIds.has(id), id));
  history.figures.forEach((figure) => { assert.ok(publicPeople.has(figure.personSlug), figure.personSlug); assert.ok(getPublicPersonView(figure.personSlug)); assertSources(figure.sourceIds); });
  history.architecture?.forEach((item) => assertSources(item.sourceIds));
  history.companies.forEach((company) => { assert.ok(buildCompanyProfileView(company.companySlug), company.companySlug); assert.ok(getCompanyPlatformHistoryLinks(company.companySlug).some((link) => link.platformSlug === "xboxone")); assertSources(company.sourceIds); });
  history.gameGroups?.flatMap((group) => group.games).forEach((game) => { game.companySlugs.forEach((slug) => assert.ok(buildCompanyProfileView(slug), slug)); assertSources(game.sourceIds); });
  history.hardware.forEach((item) => assertSources(item.sourceIds));
  history.services?.forEach((item) => assertSources(item.sourceIds));
  history.compatibilityLinks?.forEach((item) => assertSources(item.sourceIds));
  history.editorialSections?.forEach((section) => { assertSources(section.sourceIds); section.cards.forEach((card) => assertSources(card.sourceIds)); });
  history.milestones.forEach((item) => assertSources(item.sourceIds));
});

test("publishes backed people and retains weak biographies internally", () => {
  assert.equal(people.profiles?.length, 4);
  people.profiles?.forEach((profile) => assert.ok(getPublicPersonView(profile.slug), profile.slug));
  const sourceIds = new Set<string>();
  for (const rows of [people.companyRelations ?? [], people.positions ?? [], people.relatedWorks ?? [], people.historicalRelations ?? []]) rows.forEach((row) => sourceIds.add(row.sourceId));
  people.profiles?.forEach((profile) => profile.sourceIds.forEach((id) => sourceIds.add(id)));
  sourceIds.forEach((id) => assert.ok(getPersonPublicSource(id), id));
  const publicPeople = new Set(getPublicPersonSlugs());
  internal.peopleCandidates.forEach((candidate) => assert.equal(publicPeople.has(candidate.personSlug), false, candidate.personSlug));
  const fallback = new Set(internal.mediaReferences.map((item) => item.personSlug));
  people.profiles?.forEach((profile) => { if (!profile.portrait) assert.ok(fallback.has(profile.slug), profile.slug); });
  assert.doesNotMatch(readFileSync("src/lib/person-public-research.ts", "utf8"), /internal-candidates-xboxone\.json/);
});
