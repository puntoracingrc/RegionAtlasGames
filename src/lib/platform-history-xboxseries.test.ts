import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import internalData from "../../data/research/platform-history/internal-candidates-xboxseries.json";
import peopleData from "../../data/research/platform-history/people-xboxseries-public.json";
import { buildCompanyProfileView } from "./company-profile";
import { getCompanyPlatformHistoryLinks, getPlatformHardwareGroup, getPlatformHistory } from "./platform-history";
import { getPersonPublicSource, getPublicPersonSlugs, getPublicPersonView } from "./person-public-research";
import type { PersonPublicOverlayData } from "./person-research-types";

const people = peopleData as unknown as PersonPublicOverlayData;
const internal = internalData as { peopleCandidates: { personSlug: string }[]; mediaReferences: { personSlug: string }[] };

test("publishes Xbox Series X|S as an active generation", () => {
  const history = getPlatformHistory("xboxseries");
  assert.ok(history);
  assert.equal(history.generationStatus?.labelEs, "Generación en curso");
  assert.equal(history.generationStatus?.asOf, "2026-09");
  assert.equal(history.figures.length, 7);
  assert.equal(history.architecture?.length, 5);
  assert.equal(history.companies.length, 27);
  assert.equal(history.gameGroups?.flatMap((group) => group.games).length, 22);
  assert.equal(history.hardware.length, 9);
  assert.equal(history.services?.length, 4);
  assert.equal(history.compatibilityLinks?.length, 3);
  assert.equal(history.genealogies.length, 12);
  assert.equal(history.editorialSections?.length, 8);
  assert.equal(history.milestones.length, 14);
  assert.match(history.summaryParagraphsEs.join(" "), /no publica una cifra lifetime oficial/i);
});

test("keeps Series S, Ally and Project Helix in their real scopes", () => {
  const history = getPlatformHistory("xboxseries");
  assert.ok(history);
  const hardware = new Map(history.hardware.map((item) => [item.id, item]));
  assert.equal(hardware.get("hardware-xseries-s")?.kind, "BASE_MODEL");
  assert.match(hardware.get("hardware-xseries-s")?.summaryEs ?? "", /misma generación/i);
  assert.equal(hardware.get("hardware-xseries-x25")?.kind, "COMMEMORATIVE_HARDWARE");
  assert.equal(getPlatformHardwareGroup("xboxseries", "hardware-xseries-controller"), "controllers");
  assert.equal(getPlatformHardwareGroup("xboxseries", "hardware-xseries-ally"), "peripherals");
  assert.match(hardware.get("hardware-xseries-ally")?.summaryEs ?? "", /PC portátiles Windows/i);
  assert.equal(hardware.get("hardware-xseries-helix")?.kind, "DEVELOPMENT_HARDWARE");
  assert.match(hardware.get("hardware-xseries-helix")?.summaryEs ?? "", /no está lanzada/i);
  assert.ok(hardware.get("hardware-xseries-helix")?.features.some((item) => /desde 2027/i.test(item)));
});

test("dates completed acquisitions and preserves every open 2026 process", () => {
  const history = getPlatformHistory("xboxseries");
  assert.ok(history);
  const companies = new Map(history.companies.map((item) => [item.companySlug, item]));
  assert.equal(companies.get("zenimax-media")?.relationshipStart, "2021-03-09");
  assert.equal(companies.get("activision")?.relationshipStart, "2023-10-13");
  assert.equal(companies.get("tango-gameworks")?.relationshipEnd, "2024-08");
  assert.equal(companies.get("arkane-austin")?.relationshipEnd, "2024-05");
  assert.equal(companies.get("arkane-studios")?.relationshipEnd, null);
  for (const slug of ["double-fine-productions", "compulsion-games", "ninja-theory", "undead-labs"]) {
    assert.equal(companies.get(slug)?.relationshipEnd, null, slug);
  }
  const genealogy = new Map(history.genealogies.map((item) => [item.sourceCompanySlug, item]));
  assert.equal(genealogy.get("double-fine-productions")?.relationshipType, "PENDING_TRANSFER");
  assert.equal(genealogy.get("compulsion-games")?.relationshipType, "PENDING_TRANSFER");
  assert.equal(genealogy.get("ninja-theory")?.relationshipType, "PENDING_TRANSFER");
  assert.equal(genealogy.get("undead-labs")?.relationshipType, "PENDING_TRANSFER");
  assert.equal(genealogy.get("arkane-studios")?.relationshipType, "CONSULTATION_STARTED");
});

test("keeps current leadership and completed roles separated", () => {
  const history = getPlatformHistory("xboxseries");
  assert.ok(history);
  const figures = new Map(history.figures.map((item) => [item.personSlug, item]));
  assert.match(figures.get("phil-spencer")?.period ?? "", /feb 2026/i);
  assert.match(figures.get("sarah-bond")?.period ?? "", /feb 2026/i);
  assert.match(figures.get("asha-sharma")?.period ?? "", /actualidad/i);
  assert.match(figures.get("helen-chiang")?.period ?? "", /actualidad/i);
  assert.equal(getPublicPersonView("phil-spencer")?.profile.careerEnd, "2026");
  assert.match(getPublicPersonView("asha-sharma")?.profile.biographyEs ?? "", /CEO de Xbox/i);
  assert.match(getPublicPersonView("helen-chiang")?.profile.biographyEs ?? "", /Chief Operating Officer/i);
});

test("keeps services distinct and compatibility bounded", () => {
  const history = getPlatformHistory("xboxseries");
  assert.ok(history);
  const services = new Map(history.services?.map((item) => [item.id, item]));
  assert.match(services.get("service-xseries-gamepass")?.summaryEs ?? "", /planes y políticas/i);
  assert.match(services.get("service-xseries-cloud")?.summaryEs ?? "", /móviles, web, televisores/i);
  assert.ok(services.get("service-xseries-play-anywhere")?.features.some((item) => /No es cloud gaming/i.test(item)));
  assert.ok(history.compatibilityLinks?.every((item) => /selecci|límites|licencias/i.test(`${item.summaryEs} ${item.features.join(" ")}`)));
});

test("resolves every Xbox Series public relation and source", () => {
  const history = getPlatformHistory("xboxseries");
  assert.ok(history);
  const publicPeople = new Set(getPublicPersonSlugs());
  const sourceIds = new Set(history.sources.map((source) => source.id));
  const assertSources = (ids: string[]) => ids.forEach((id) => assert.ok(sourceIds.has(id), id));
  if (history.generationStatus) assertSources(history.generationStatus.sourceIds);
  history.figures.forEach((figure) => { assert.ok(publicPeople.has(figure.personSlug), figure.personSlug); assert.ok(getPublicPersonView(figure.personSlug)); assertSources(figure.sourceIds); });
  history.architecture?.forEach((item) => assertSources(item.sourceIds));
  history.companies.forEach((company) => { assert.ok(buildCompanyProfileView(company.companySlug), company.companySlug); assert.ok(getCompanyPlatformHistoryLinks(company.companySlug).some((link) => link.platformSlug === "xboxseries")); assertSources(company.sourceIds); });
  history.genealogies.forEach((item) => assertSources(item.sourceIds));
  history.gameGroups?.flatMap((group) => group.games).forEach((game) => { game.companySlugs.forEach((slug) => assert.ok(buildCompanyProfileView(slug), slug)); assertSources(game.sourceIds); });
  history.hardware.forEach((item) => assertSources(item.sourceIds));
  history.services?.forEach((item) => assertSources(item.sourceIds));
  history.compatibilityLinks?.forEach((item) => assertSources(item.sourceIds));
  history.editorialSections?.forEach((section) => { assertSources(section.sourceIds); section.cards.forEach((card) => assertSources(card.sourceIds)); });
  history.milestones.forEach((item) => assertSources(item.sourceIds));
});

test("publishes backed people and keeps weaker biographies internal", () => {
  assert.equal(people.profiles?.length, 5);
  assert.equal(people.profilePatches?.length, 2);
  people.profiles?.forEach((profile) => assert.ok(getPublicPersonView(profile.slug), profile.slug));
  const personSourceIds = new Set<string>();
  for (const rows of [people.companyRelations ?? [], people.positions ?? [], people.relatedWorks ?? [], people.historicalRelations ?? []]) rows.forEach((row) => personSourceIds.add(row.sourceId));
  people.profiles?.forEach((profile) => profile.sourceIds.forEach((id) => personSourceIds.add(id)));
  people.profilePatches?.forEach((profile) => profile.sourceIds?.forEach((id) => personSourceIds.add(id)));
  personSourceIds.forEach((id) => assert.ok(getPersonPublicSource(id), id));
  const publicPeople = new Set(getPublicPersonSlugs());
  internal.peopleCandidates.forEach((candidate) => assert.equal(publicPeople.has(candidate.personSlug), false, candidate.personSlug));
  const fallback = new Set(internal.mediaReferences.map((item) => item.personSlug));
  people.profiles?.forEach((profile) => { if (!profile.portrait) assert.ok(fallback.has(profile.slug), profile.slug); });
  assert.doesNotMatch(readFileSync("src/lib/person-public-research.ts", "utf8"), /internal-candidates-xboxseries\.json/);
});
