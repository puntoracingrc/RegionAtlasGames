import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import catalogData from "../../data/catalog.json";
import companiesData from "../../data/index/companies.json";
import internalPs3Data from "../../data/research/platform-history/internal-candidates-ps3.json";
import peoplePs3Data from "../../data/research/platform-history/people-ps3-public.json";
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
const companies = companiesData as Record<string, unknown>;
const peoplePs3 = peoplePs3Data as unknown as PersonPublicOverlayData;
const internalPs3 = internalPs3Data as {
  companyReferences: { slug: string }[];
  catalogReferences: { title: string; status: string }[];
  mediaReferences: { personSlug: string; status: string }[];
};

test("publishes the expanded PlayStation 3 history model", () => {
  const history = getPlatformHistory("ps3");
  assert.ok(history);
  assert.equal(history.figures.length, 23);
  assert.equal(history.architecture?.length, 5);
  assert.equal(history.companies.length, 21);
  assert.equal(history.genealogies.length, 3);
  assert.equal(history.gameGroups?.flatMap((group) => group.games).length, 34);
  assert.equal(history.hardware.length, 11);
  assert.equal(history.services?.length, 4);
  assert.equal(history.compatibilityByHardwareRevision?.length, 4);
  assert.equal(history.milestones.length, 27);
  assert.equal(history.sources.length, 37);
  assert.ok((history.historyParagraphsEs?.length ?? 0) >= 5);
  assert.ok(history.legacyEs.length >= 5);
});

test("resolves every public person, company, game and source link", () => {
  const history = getPlatformHistory("ps3");
  assert.ok(history);
  const publicPeople = new Set(getPublicPersonSlugs());
  const sourceIds = new Set(history.sources.map((source) => source.id));

  for (const figure of history.figures) {
    assert.ok(publicPeople.has(figure.personSlug), figure.personSlug);
    assert.ok(getPublicPersonView(figure.personSlug), figure.personSlug);
    figure.sourceIds.forEach((sourceId) => assert.ok(sourceIds.has(sourceId), sourceId));
  }

  for (const company of history.companies) {
    assert.ok(companies[company.companySlug], company.companySlug);
    company.sourceIds.forEach((sourceId) => assert.ok(sourceIds.has(sourceId), sourceId));
    for (const game of company.relatedCatalogEntries ?? []) {
      assert.ok(catalogIds.has(game.id), game.id);
    }
    assert.ok(
      getCompanyPlatformHistoryLinks(company.companySlug).some(
        (link) => link.platformSlug === "ps3",
      ),
      company.companySlug,
    );
  }

  for (const item of history.architecture ?? []) {
    item.sourceIds.forEach((sourceId) => assert.ok(sourceIds.has(sourceId), sourceId));
    for (const partner of item.partners) {
      if (partner.companySlug) assert.ok(companies[partner.companySlug], partner.companySlug);
    }
  }

  for (const group of history.gameGroups ?? []) {
    for (const game of group.games) {
      if (game.catalogId) assert.ok(catalogIds.has(game.catalogId), game.catalogId);
      game.companySlugs.forEach((slug) => assert.ok(companies[slug], slug));
      game.sourceIds.forEach((sourceId) => assert.ok(sourceIds.has(sourceId), sourceId));
    }
  }

  for (const item of history.hardware) {
    if (item.manufacturerCompanySlug) {
      assert.ok(companies[item.manufacturerCompanySlug], item.manufacturerCompanySlug);
      assert.ok(item.manufacturerCompanyName, item.id);
    }
    item.relatedPersonSlugs.forEach((slug) => assert.ok(publicPeople.has(slug), slug));
    item.sourceIds.forEach((sourceId) => assert.ok(sourceIds.has(sourceId), sourceId));
  }

  for (const milestone of history.milestones) {
    milestone.sourceIds.forEach((sourceId) => assert.ok(sourceIds.has(sourceId), sourceId));
  }
});

test("protects PS3 studio ownership by acquisition date", () => {
  const history = getPlatformHistory("ps3");
  assert.ok(history);
  const bySlug = new Map(history.companies.map((company) => [company.companySlug, company]));

  assert.equal(bySlug.get("guerrilla-games")?.relationshipType, "FIRST_PARTY_ACQUISITION");
  assert.match(bySlug.get("guerrilla-games")?.period ?? "", /2005/);
  assert.equal(bySlug.get("media-molecule")?.relationshipType, "FIRST_PARTY_ACQUISITION");
  assert.match(bySlug.get("media-molecule")?.period ?? "", /2010/);
  assert.equal(bySlug.get("sucker-punch-productions")?.relationshipType, "FIRST_PARTY_ACQUISITION");
  assert.match(bySlug.get("sucker-punch-productions")?.period ?? "", /2011/);

  for (const slug of ["insomniac-games", "quantic-dream", "thatgamecompany-jenova-chen"]) {
    assert.equal(bySlug.get(slug)?.relationshipType, "STRATEGIC_THIRD_PARTY", slug);
  }
  assert.equal(bySlug.get("fromsoftware")?.relationshipType, "KEY_DEVELOPER");
  assert.match(bySlug.get("fromsoftware")?.period ?? "", /Independiente/);

  const games = history.gameGroups?.flatMap((group) => group.games) ?? [];
  assert.equal(games.find((game) => game.title === "LittleBigPlanet")?.relationshipType, "INDEPENDENT_PARTNER");
  assert.equal(games.find((game) => game.title === "LittleBigPlanet 2")?.relationshipType, "FIRST_PARTY");
  assert.equal(games.find((game) => game.title === "inFAMOUS 2")?.relationshipType, "INDEPENDENT_PARTNER");
  for (const game of games.filter((candidate) => candidate.companySlugs.includes("insomniac-games"))) {
    assert.equal(game.relationshipType, "INDEPENDENT_PARTNER", game.title);
  }

  const acquisitions = new Map(history.genealogies.map((relation) => [relation.sourceCompanySlug, relation]));
  assert.equal(acquisitions.get("guerrilla-games")?.year, 2005);
  assert.equal(acquisitions.get("media-molecule")?.year, 2010);
  assert.equal(acquisitions.get("sucker-punch-productions")?.year, 2011);
  for (const relation of acquisitions.values()) {
    assert.equal(relation.relationshipType, "ACQUIRED_BY");
    assert.equal(relation.targetCompanySlug, "sony-interactive-entertainment");
    assert.ok(
      getCompanyGenealogyRelations(relation.sourceCompanySlug).some(
        (candidate) => candidate.id === relation.id,
      ),
      relation.id,
    );
  }
});

test("models Cell, RSX, Blu-ray and unresolved technology partners without fake links", () => {
  const history = getPlatformHistory("ps3");
  assert.ok(history);
  const architecture = new Map(
    (history.architecture ?? []).map((item) => [item.id, item]),
  );
  const cell = architecture.get("architecture-ps3-cell");
  const rsx = architecture.get("architecture-ps3-rsx");
  assert.ok(cell?.partners.some((partner) => partner.companyName === "IBM" && partner.companySlug === null));
  assert.ok(cell?.partners.some((partner) => partner.companyName === "Toshiba" && partner.companySlug === null));
  assert.ok(rsx?.partners.some((partner) => partner.companyName === "NVIDIA" && partner.companySlug === null));
  assert.ok(architecture.has("architecture-ps3-blu-ray"));
  assert.deepEqual(
    internalPs3.companyReferences.map((candidate) => candidate.slug),
    ["ibm", "toshiba", "nvidia"],
  );
});

test("models PSN, Store and Plus as a resolvable service graph", () => {
  const history = getPlatformHistory("ps3");
  assert.ok(history);
  const services = new Map((history.services ?? []).map((service) => [service.id, service]));
  const psn = services.get("service-ps3-psn");
  const store = services.get("service-ps3-store");
  const plus = services.get("service-ps3-plus");
  assert.equal(psn?.kind, "NETWORK_SERVICE");
  assert.equal(store?.kind, "STORE_SERVICE");
  assert.equal(store?.parentServiceId, psn?.id);
  assert.equal(plus?.kind, "SUBSCRIPTION_SERVICE");
  assert.equal(plus?.parentServiceId, psn?.id);
  for (const service of services.values()) {
    if (service.parentServiceId) assert.ok(services.has(service.parentServiceId), service.id);
  }
});

test("keeps backward compatibility revision-specific", () => {
  const history = getPlatformHistory("ps3");
  assert.ok(history);
  const hardwareIds = new Set(history.hardware.map((item) => item.id));
  const compatibility = history.compatibilityByHardwareRevision ?? [];
  assert.equal(new Set(compatibility.map((item) => item.hardwareId)).size, compatibility.length);
  for (const revision of compatibility) {
    assert.ok(hardwareIds.has(revision.hardwareId), revision.hardwareId);
    assert.ok(revision.ps1SupportEs.length > 10, revision.hardwareId);
    assert.ok(revision.ps2SupportEs.length > 10, revision.hardwareId);
  }
  assert.match(
    compatibility.find((item) => item.hardwareId === "hardware-ps3-fat-europe-cechc")?.ps2SupportEs ?? "",
    /limitada/i,
  );
  assert.match(
    compatibility.find((item) => item.hardwareId === "hardware-ps3-slim-cech-2000a")?.ps2SupportEs ?? "",
    /No es compatible/i,
  );
  assert.equal(getPlatformHardwareGroup("ps3", "hardware-ps3-playstation-move"), "controllers");
  assert.equal(getPlatformHardwareGroup("ps3", "hardware-ps3-playstation-eye"), "peripherals");
});

test("documents the 2011 PSN incident without asserting unconfirmed card theft", () => {
  const history = getPlatformHistory("ps3");
  assert.ok(history);
  const incident = history.milestones.find((item) => item.id === "PHM-PS3-2011-PSN");
  assert.ok(incident);
  assert.match(incident.summaryEs, /intrusión no autorizada/i);
  assert.match(incident.summaryEs, /datos personales/i);
  assert.match(incident.summaryEs, /no confirmó/i);
  assert.doesNotMatch(incident.summaryEs, /robo (?:probado|confirmado) de (?:datos de )?tarjetas/i);
});

test("publishes 16 new people, patches 7 existing profiles and preserves credit precision", () => {
  assert.equal(peoplePs3.profiles?.length, 16);
  assert.equal(peoplePs3.profilePatches?.length, 7);
  assert.equal(peoplePs3.historicalRelations?.length, 23);
  for (const profile of peoplePs3.profiles ?? []) {
    assert.ok(getPublicPersonView(profile.slug), profile.slug);
  }
  for (const patch of peoplePs3.profilePatches ?? []) {
    assert.ok(getPublicPersonView(patch.slug), patch.slug);
  }
  for (const work of peoplePs3.exactCredits ?? []) {
    assert.equal(work.relationshipPrecision, "EXACT_EDITORIAL_CREDIT", work.id);
    if (work.catalogId) assert.ok(catalogIds.has(work.catalogId), work.catalogId);
  }
  for (const work of peoplePs3.relatedWorks ?? []) {
    assert.equal(work.relationshipPrecision, "ASSOCIATION_NOT_EXACT_CREDIT", work.id);
    if (work.catalogId) assert.ok(catalogIds.has(work.catalogId), work.catalogId);
  }
  const executiveSlugs = new Set([
    "ken-kutaragi",
    "kazuo-hirai",
    "shuhei-yoshida",
    "david-reeves",
    "jack-tretton",
    "andrew-house",
    "akira-sato",
    "masaru-kato",
  ]);
  assert.equal(
    (peoplePs3.exactCredits ?? []).some((work) => executiveSlugs.has(work.personSlug)),
    false,
  );

  const referencedSourceIds = new Set<string>();
  for (const profile of peoplePs3.profiles ?? []) {
    profile.sourceIds.forEach((sourceId) => referencedSourceIds.add(sourceId));
    profile.biographyClaims.flatMap((claim) => claim.sourceIds).forEach((sourceId) => referencedSourceIds.add(sourceId));
    Object.values(profile.fieldSources).flat().forEach((sourceId) => referencedSourceIds.add(sourceId));
    if (profile.portrait) referencedSourceIds.add(profile.portrait.sourceId);
  }
  for (const patch of peoplePs3.profilePatches ?? []) {
    patch.sourceIds?.forEach((sourceId) => referencedSourceIds.add(sourceId));
    patch.biographyClaims?.flatMap((claim) => claim.sourceIds).forEach((sourceId) => referencedSourceIds.add(sourceId));
    if (patch.fieldSources) {
      Object.values(patch.fieldSources).flat().forEach((sourceId) => referencedSourceIds.add(sourceId));
    }
  }
  for (const rows of [
    peoplePs3.companyRelations ?? [],
    peoplePs3.positions ?? [],
    peoplePs3.exactCredits ?? [],
    peoplePs3.relatedWorks ?? [],
    peoplePs3.awards ?? [],
    peoplePs3.curiosities ?? [],
    peoplePs3.historicalRelations ?? [],
  ]) {
    rows.forEach((row) => referencedSourceIds.add(row.sourceId));
  }
  referencedSourceIds.forEach((sourceId) => {
    assert.ok(getPersonPublicSource(sourceId), sourceId);
  });
});

test("keeps Mark Cerny as a transition figure and publishes personal awards", () => {
  const view = getPublicPersonView("mark-cerny");
  assert.ok(view);
  assert.match(view.profile.biographyEs, /consultor/i);
  assert.match(view.profile.biographyEs, /PS4 y PS5/);
  assert.doesNotMatch(view.profile.biographyEs, /arquitect[oa] de (?:la )?PS3/i);
  assert.ok(view.relatedWorks.length >= 3);
  assert.equal(view.exactCredits.length, 0);
  assert.ok(view.awards.some((award) => award.date === 2004));
  assert.ok(view.awards.some((award) => award.date === 2010));

  const amy = getPublicPersonView("amy-hennig");
  assert.ok(amy?.awards.some((award) => String(award.date).startsWith("2016")));
  assert.ok(amy?.awards.some((award) => String(award.date) === "2019"));
});

test("uses only licensed local portraits and records every fallback", () => {
  const allowedLicenses = new Set([
    "CC BY 2.0",
    "CC BY 4.0",
    "CC BY-SA 2.0",
    "CC BY-SA 3.0",
    "CC BY-SA 4.0",
  ]);
  const fallbackSlugs = new Set(
    internalPs3.mediaReferences
      .filter((item) => item.status === "NO_LICENSED_PORTRAIT_FOUND")
      .map((item) => item.personSlug),
  );

  for (const profile of peoplePs3.profiles ?? []) {
    if (!profile.portrait) {
      assert.ok(fallbackSlugs.has(profile.slug), profile.slug);
      continue;
    }
    assert.ok(allowedLicenses.has(profile.portrait.license), profile.slug);
    assert.ok(profile.portrait.attributionRequired, profile.slug);
    assert.ok(profile.portrait.sourceUrl.includes("commons.wikimedia.org"), profile.slug);
    assert.ok(existsSync(`public${profile.portrait.path}`), profile.portrait.path);
    assert.ok(getPersonPublicSource(profile.portrait.sourceId), profile.portrait.sourceId);
  }
});

test("does not expose PS3 internal candidates through public loaders", () => {
  const loader = readFileSync("src/lib/person-public-research.ts", "utf-8");
  assert.doesNotMatch(loader, /internal-candidates-ps3\.json/);
  assert.ok(internalPs3.catalogReferences.some((item) => item.title === "Flower"));
});
