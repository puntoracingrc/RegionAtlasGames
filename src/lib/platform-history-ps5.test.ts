import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import catalogData from "../../data/catalog.json";
import internalPs5Data from "../../data/research/platform-history/internal-candidates-ps5.json";
import peoplePs5Data from "../../data/research/platform-history/people-ps5-public.json";
import { buildCompanyProfileView } from "./company-profile";
import {
  getCompanyGenealogyRelations,
  getCompanyPlatformHistoryLinks,
  getPlatformHardwareGroup,
  getPlatformHistory,
} from "./platform-history";
import {
  getPersonPublicSource,
  getPublicPersonSlugs,
  getPublicPersonView,
} from "./person-public-research";
import type { PersonPublicOverlayData } from "./person-research-types";
import type { CatalogGame } from "./types";

const catalog = catalogData as CatalogGame[];
const catalogIds = new Set(catalog.map((game) => game.id));
const peoplePs5 = peoplePs5Data as unknown as PersonPublicOverlayData;
const internalPs5 = internalPs5Data as {
  mediaReferences: { personSlug: string; status: string }[];
  catalogReferences: { title: string; status: string }[];
};

test("publishes a complete, active-generation PlayStation 5 history", () => {
  const history = getPlatformHistory("ps5");
  assert.ok(history);
  assert.equal(history.generationStatus?.asOf, "2026-09-15");
  assert.match(history.generationStatus?.labelEs ?? "", /Generación en curso/);
  assert.match(history.generationStatus?.summaryEs ?? "", /95 millones/);
  assert.equal(history.figures.length, 22);
  assert.equal(history.architecture?.length, 6);
  assert.equal(history.companies.length, 30);
  assert.equal(history.companyGroups?.length, 3);
  assert.equal(history.genealogies.length, 15);
  assert.equal(history.gameGroups?.flatMap((group) => group.games).length, 26);
  assert.equal(history.hardware.length, 11);
  assert.equal(history.services?.length, 5);
  assert.equal(history.compatibilityLinks?.length, 1);
  assert.equal(history.editorialSections?.length, 6);
  assert.equal(history.milestones.length, 28);
  assert.equal(history.sources.length, 40);
  assert.ok((history.historyParagraphsEs?.length ?? 0) >= 5);
});

test("resolves every PS5 public link and all cited sources", () => {
  const history = getPlatformHistory("ps5");
  assert.ok(history);
  const publicPeople = new Set(getPublicPersonSlugs());
  const sourceIds = new Set(history.sources.map((source) => source.id));

  const assertSources = (ids: string[]) => ids.forEach((id) => assert.ok(sourceIds.has(id), id));
  assertSources(history.generationStatus?.sourceIds ?? []);
  history.figures.forEach((figure) => {
    assert.ok(publicPeople.has(figure.personSlug), figure.personSlug);
    assert.ok(getPublicPersonView(figure.personSlug), figure.personSlug);
    assertSources(figure.sourceIds);
  });

  const companySlugs = new Set(history.companies.map((company) => company.companySlug));
  history.companies.forEach((company) => {
    const view = buildCompanyProfileView(company.companySlug);
    assert.ok(view, company.companySlug);
    assertSources(company.sourceIds);
    assert.ok(
      getCompanyPlatformHistoryLinks(company.companySlug).some((link) => link.platformSlug === "ps5"),
      company.companySlug,
    );
    company.relatedCatalogEntries?.forEach((game) => assert.ok(catalogIds.has(game.id), game.id));
  });
  history.companyGroups?.forEach((group) => {
    group.companySlugs.forEach((slug) => assert.ok(companySlugs.has(slug), slug));
  });

  history.genealogies.forEach((relation) => {
    assert.ok(buildCompanyProfileView(relation.sourceCompanySlug), relation.sourceCompanySlug);
    if (relation.targetCompanySlug) assert.ok(buildCompanyProfileView(relation.targetCompanySlug), relation.targetCompanySlug);
    assert.ok(getCompanyGenealogyRelations(relation.sourceCompanySlug).some((item) => item.id === relation.id));
    assertSources(relation.sourceIds);
  });
  history.architecture?.forEach((item) => {
    assertSources(item.sourceIds);
    item.partners.forEach((partner) => {
      if (partner.companySlug) assert.ok(buildCompanyProfileView(partner.companySlug), partner.companySlug);
    });
  });
  history.gameGroups?.flatMap((group) => group.games).forEach((game) => {
    if (game.catalogId) assert.ok(catalogIds.has(game.catalogId), game.catalogId);
    game.companySlugs.forEach((slug) => assert.ok(buildCompanyProfileView(slug), slug));
    assertSources(game.sourceIds);
  });
  history.hardware.forEach((item) => {
    if (item.manufacturerCompanySlug) assert.ok(buildCompanyProfileView(item.manufacturerCompanySlug), item.manufacturerCompanySlug);
    item.relatedPersonSlugs.forEach((slug) => assert.ok(publicPeople.has(slug), slug));
    item.relatedCatalogEntries?.forEach((game) => assert.ok(catalogIds.has(game.id), game.id));
    assertSources(item.sourceIds);
  });
  history.services?.forEach((service) => assertSources(service.sourceIds));
  history.compatibilityLinks?.forEach((item) => assertSources(item.sourceIds));
  history.editorialSections?.forEach((section) => {
    assertSources(section.sourceIds);
    section.cards.forEach((card) => assertSources(card.sourceIds));
  });
  history.milestones.forEach((milestone) => assertSources(milestone.sourceIds));
});

test("keeps PS5 leadership roles within their documented intervals", () => {
  const nishino = getPublicPersonView("hideaki-nishino");
  const hulst = getPublicPersonView("hermen-hulst");
  const ryan = getPublicPersonView("jim-ryan");
  const totoki = getPublicPersonView("hiroki-totoki");
  assert.ok(nishino?.positions.some((item) => item.name.includes("President y CEO") && item.start === "2025-04-01" && item.end === null));
  assert.ok(hulst?.positions.some((item) => item.name === "CEO de Studio Business Group" && item.start === "2024-06-01"));
  assert.equal(hulst?.positions.some((item) => item.name === "President y CEO de Sony Interactive Entertainment"), false);
  assert.ok(ryan?.positions.some((item) => item.end === "2024-03-31"));
  assert.equal(ryan?.positions.some((item) => !item.end || item.end > "2024-03-31"), false);
  assert.ok(totoki?.positions.some((item) => item.name.startsWith("Interim CEO") && item.start === "2024-04-01" && item.end === "2024-05-31"));
  assert.equal(totoki?.exactCredits.length, 0);
});

test("protects acquisition timing, independent partners and 2024 closures", () => {
  const history = getPlatformHistory("ps5");
  assert.ok(history);
  const companies = new Map(history.companies.map((company) => [company.companySlug, company]));
  assert.match(companies.get("insomniac-games")?.period ?? "", /antes de PS5/i);
  assert.match(companies.get("housemarque")?.period ?? "", /hasta 29 jun 2021/i);
  assert.match(companies.get("bluepoint-games")?.period ?? "", /hasta sep 2021/i);
  assert.match(companies.get("haven-studios")?.period ?? "", /2022/);
  for (const slug of ["arrowhead-game-studios", "kojima-productions", "shift-up", "team-ninja"]) {
    assert.equal(companies.get(slug)?.relationshipType, "STRATEGIC_THIRD_PARTY", slug);
  }
  assert.equal(companies.get("fromsoftware")?.relationshipType, "KEY_DEVELOPER");
  assert.match(companies.get("bungie")?.contributionEs ?? "", /multiplataforma/i);

  const relations = new Map(history.genealogies.map((relation) => [relation.id, relation]));
  assert.equal(relations.get("PHG-PS5-HOUSEMARQUE-SIE")?.year, 2021);
  assert.equal(relations.get("PHG-PS5-BLUEPOINT-SIE")?.year, 2021);
  assert.equal(relations.get("PHG-PS5-HAVEN-SIE")?.year, 2022);
  for (const id of ["PHG-PS5-FIREWALK-CLOSED", "PHG-PS5-NEON-CLOSED", "PHG-PS5-LONDON-CLOSED"]) {
    assert.equal(relations.get(id)?.relationshipType, "CLOSED", id);
    assert.equal(relations.get(id)?.year, 2024, id);
  }
  assert.equal(buildCompanyProfileView("firewalk-studios")?.status, "defunct");
  assert.equal(buildCompanyProfileView("neon-koi")?.status, "defunct");
  assert.equal(buildCompanyProfileView("haven-studios")?.status, "subsidiary");
});

test("models PS5 Pro, Portal, PS VR2, Access and hardware groups precisely", () => {
  const history = getPlatformHistory("ps5");
  assert.ok(history);
  const hardware = new Map(history.hardware.map((item) => [item.id, item]));
  const pro = hardware.get("hardware-ps5-pro");
  const portal = hardware.get("hardware-ps5-portal");
  assert.equal(pro?.kind, "MID_GENERATION_UPGRADE");
  assert.match(pro?.summaryEs ?? "", /no inaugura una nueva generación/i);
  assert.ok(pro?.features.some((feature) => feature.includes("2 TB")));
  assert.equal(portal?.kind, "REMOTE_PLAYER");
  assert.match(portal?.summaryEs ?? "", /No es una consola portátil autónoma/i);
  assert.equal(hardware.get("hardware-ps5-psvr2")?.kind, "VR_HEADSET");
  assert.equal(hardware.get("hardware-ps5-access")?.kind, "ACCESSIBILITY_CONTROLLER");
  assert.equal(getPlatformHardwareGroup("ps5", "hardware-ps5-pro"), "models");
  assert.equal(getPlatformHardwareGroup("ps5", "hardware-ps5-dualsense-edge"), "controllers");
  assert.equal(getPlatformHardwareGroup("ps5", "hardware-ps5-portal"), "peripherals");
});

test("models PS4 compatibility and the 2022 PlayStation Plus transition", () => {
  const history = getPlatformHistory("ps5");
  assert.ok(history);
  const compatibility = history.compatibilityLinks?.[0];
  assert.equal(compatibility?.targetPlatformSlug, "ps4");
  assert.match(compatibility?.summaryEs ?? "", /miles de juegos/i);
  assert.doesNotMatch(compatibility?.summaryEs ?? "", /100 ?%/i);
  const services = new Map((history.services ?? []).map((service) => [service.id, service]));
  assert.equal(services.get("service-ps5-now")?.successorServiceId, "service-ps5-plus");
  assert.match(services.get("service-ps5-now")?.statusLabelEs ?? "", /No activo/i);
  assert.match(services.get("service-ps5-plus")?.summaryEs ?? "", /Essential, Extra y Premium o Deluxe/);
});

test("publishes 17 PS5 people, patches 5 existing profiles and preserves credit precision", () => {
  assert.equal(peoplePs5.profiles?.length, 17);
  assert.equal(peoplePs5.profilePatches?.length, 5);
  assert.equal(peoplePs5.historicalRelations?.length, 22);
  peoplePs5.profiles?.forEach((profile) => assert.ok(getPublicPersonView(profile.slug), profile.slug));
  peoplePs5.profilePatches?.forEach((patch) => assert.ok(getPublicPersonView(patch.slug), patch.slug));
  peoplePs5.exactCredits?.forEach((work) => {
    assert.equal(work.relationshipPrecision, "EXACT_EDITORIAL_CREDIT", work.id);
    if (work.catalogId) assert.ok(catalogIds.has(work.catalogId), work.catalogId);
  });
  peoplePs5.relatedWorks?.forEach((work) => {
    assert.equal(work.relationshipPrecision, "ASSOCIATION_NOT_EXACT_CREDIT", work.id);
    if (work.catalogId) assert.ok(catalogIds.has(work.catalogId), work.catalogId);
  });
  assert.equal(getPublicPersonView("mark-cerny")?.exactCredits.length, 0);
  assert.equal(getPublicPersonView("nicolas-doucet")?.awards.length, 0);
  assert.ok(getPublicPersonView("nicolas-doucet")?.curiosities.some((item) => /pertenece a Astro Bot/i.test(item.summaryEs)));

  const referenced = new Set<string>();
  for (const profile of peoplePs5.profiles ?? []) {
    profile.sourceIds.forEach((id) => referenced.add(id));
    profile.biographyClaims.flatMap((claim) => claim.sourceIds).forEach((id) => referenced.add(id));
    Object.values(profile.fieldSources).flat().forEach((id) => referenced.add(id));
    if (profile.portrait) referenced.add(profile.portrait.sourceId);
  }
  for (const rows of [peoplePs5.companyRelations ?? [], peoplePs5.positions ?? [], peoplePs5.exactCredits ?? [], peoplePs5.relatedWorks ?? [], peoplePs5.awards ?? [], peoplePs5.curiosities ?? [], peoplePs5.historicalRelations ?? []]) {
    rows.forEach((row) => referenced.add(row.sourceId));
  }
  referenced.forEach((id) => assert.ok(getPersonPublicSource(id), id));
});

test("uses only licensed local portraits and records every fallback", () => {
  const allowed = new Set(["CC BY 2.0", "CC BY 4.0", "CC BY-SA 3.0", "CC BY-SA 4.0"]);
  const fallbackSlugs = new Set(internalPs5.mediaReferences.map((item) => item.personSlug));
  for (const profile of peoplePs5.profiles ?? []) {
    if (!profile.portrait) {
      assert.ok(fallbackSlugs.has(profile.slug), profile.slug);
      continue;
    }
    assert.ok(allowed.has(profile.portrait.license), profile.slug);
    assert.ok(profile.portrait.attributionRequired, profile.slug);
    assert.ok(profile.portrait.sourceUrl.includes("commons.wikimedia.org"), profile.slug);
    assert.ok(existsSync(`public${profile.portrait.path}`), profile.portrait.path);
  }
});

test("does not expose PS5 internal candidates through public loaders", () => {
  const loader = readFileSync("src/lib/person-public-research.ts", "utf-8");
  assert.doesNotMatch(loader, /internal-candidates-ps5\.json/);
  assert.ok(internalPs5.catalogReferences.some((item) => item.title === "Astro's Playroom"));
});
