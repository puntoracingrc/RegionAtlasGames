import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import catalogData from "../../data/catalog.json";
import internalPsVitaData from "../../data/research/platform-history/internal-candidates-psvita.json";
import peoplePsVitaData from "../../data/research/platform-history/people-psvita-public.json";
import { buildCompanyProfileView } from "./company-profile";
import {
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
const peoplePsVita = peoplePsVitaData as unknown as PersonPublicOverlayData;
const internalPsVita = internalPsVitaData as {
  peopleCandidates: { personSlug: string; status: string }[];
  companyCandidates: { companySlug: string; status: string }[];
  creditCandidates: { title: string; status: string }[];
  mediaReferences: { personSlug: string; status: string }[];
};

test("publishes PS Vita as a complete platform between PS3 and PS4", () => {
  const history = getPlatformHistory("psvita");
  assert.ok(history);
  assert.equal(history.title, "PlayStation Vita");
  assert.equal(history.figures.length, 8);
  assert.equal(history.architecture?.length, 6);
  assert.equal(history.companies.length, 29);
  assert.equal(history.companyGroups?.length, 3);
  assert.equal(history.gameGroups?.flatMap((group) => group.games).length, 20);
  assert.equal(history.hardware.length, 3);
  assert.equal(history.services?.length, 3);
  assert.equal(history.editorialSections?.length, 5);
  assert.equal(history.milestones.length, 11);
  assert.equal(history.sources.length, 22);
  assert.ok((history.historyParagraphsEs?.length ?? 0) >= 5);
  assert.deepEqual(history.sectionOrder, [
    "figures",
    "architecture",
    "hardware",
    "companies",
    "games",
    "editorial:third-party-japan",
    "editorial:indie",
    "editorial:cross-platform",
    "editorial:remote-play",
    "editorial:playstation-tv",
    "services",
    "milestones",
    "legacy",
  ]);
});

test("resolves every PS Vita public relation, source and catalog link", () => {
  const history = getPlatformHistory("psvita");
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
    assert.ok(
      getCompanyPlatformHistoryLinks(company.companySlug).some((link) => link.platformSlug === "psvita"),
      company.companySlug,
    );
    company.relatedCatalogEntries?.forEach((game) => assert.ok(catalogIds.has(game.id), game.id));
    assertSources(company.sourceIds);
  });
  history.gameGroups?.flatMap((group) => group.games).forEach((game) => {
    if (game.catalogId) assert.ok(catalogIds.has(game.catalogId), game.catalogId);
    game.companySlugs.forEach((slug) => assert.ok(buildCompanyProfileView(slug), slug));
    assertSources(game.sourceIds);
  });
  history.hardware.forEach((item) => assertSources(item.sourceIds));
  history.services?.forEach((service) => assertSources(service.sourceIds));
  history.editorialSections?.forEach((section) => {
    assertSources(section.sourceIds);
    section.cards.forEach((card) => {
      assertSources(card.sourceIds);
      if (card.link?.href.startsWith("/catalogo/")) {
        assert.ok(catalogIds.has(card.link.href.replace("/catalogo/", "")), card.link.href);
      }
    });
  });
  history.milestones.forEach((milestone) => assertSources(milestone.sourceIds));
});

test("models the Vita hardware family without inventing successors", () => {
  const history = getPlatformHistory("psvita");
  assert.ok(history);
  const hardware = new Map(history.hardware.map((item) => [item.id, item]));
  assert.equal(hardware.get("hardware-vita-pch-1000")?.kind, "BASE_MODEL");
  assert.ok(hardware.get("hardware-vita-pch-1000")?.features.some((item) => /OLED/i.test(item)));
  assert.equal(hardware.get("hardware-vita-pch-2000")?.kind, "REDESIGN");
  assert.ok(hardware.get("hardware-vita-pch-2000")?.features.some((item) => /LCD/i.test(item)));
  assert.ok(hardware.get("hardware-vita-pch-2000")?.features.some((item) => /No usa pantalla OLED/i.test(item)));
  assert.equal(hardware.get("hardware-vita-tv")?.kind, "MICROCONSOLE");
  assert.match(hardware.get("hardware-vita-tv")?.summaryEs ?? "", /no es su sucesora/i);
  assert.equal(getPlatformHardwareGroup("psvita", "hardware-vita-tv"), "models");
});

test("keeps Vita Game Card and Memory Card distinct from PSP formats", () => {
  const history = getPlatformHistory("psvita");
  assert.ok(history);
  const architecture = new Map((history.architecture ?? []).map((item) => [item.id, item]));
  const gameCard = architecture.get("architecture-vita-game-card");
  const memoryCard = architecture.get("architecture-vita-memory-card");
  assert.equal(gameCard?.kind, "GAME_MEDIA");
  assert.match(gameCard?.summaryEs ?? "", /no debe describirse como soporte óptico/i);
  assert.ok(gameCard?.features.some((item) => /Sustituye UMD/i.test(item)));
  assert.match(memoryCard?.summaryEs ?? "", /distinta de Memory Stick/i);
  assert.ok(memoryCard?.features.some((item) => /No es Memory Stick/i.test(item)));
});

test("protects exact PS Vita studio and third-party identities", () => {
  const history = getPlatformHistory("psvita");
  assert.ok(history);
  const games = new Map(
    history.gameGroups?.flatMap((group) => group.games).map((game) => [game.title, game]) ?? [],
  );
  assert.deepEqual(games.get("Uncharted: Golden Abyss")?.companySlugs, ["bend-studio"]);
  assert.equal(games.get("Uncharted: Golden Abyss")?.companySlugs.includes("naughty-dog"), false);
  assert.deepEqual(games.get("LittleBigPlanet PS Vita")?.companySlugs, ["tarsier-studios", "double-eleven"]);
  assert.equal(games.get("LittleBigPlanet PS Vita")?.companySlugs.includes("media-molecule"), false);
  assert.deepEqual(games.get("Killzone: Mercenary")?.companySlugs, ["sce-cambridge-studio"]);
  assert.deepEqual(games.get("Soul Sacrifice")?.companySlugs, ["japan-studio", "marvelous"]);
  assert.match(games.get("Soul Sacrifice")?.relationshipLabelEs ?? "", /comcept/i);
  assert.deepEqual(games.get("Freedom Wars")?.companySlugs, ["japan-studio", "shift", "dimps-corporation"]);
  assert.equal(games.get("Persona 4 Golden")?.relationshipType, "THIRD_PARTY");
  assert.deepEqual(games.get("Persona 4 Golden")?.companySlugs, ["atlus"]);
  assert.equal(
    peoplePsVita.companyRelations?.some(
      (relation) => relation.personSlug === "keiji-inafune" && relation.companySlug === "sony-interactive-entertainment",
    ),
    false,
  );
});

test("describes Cross, Remote Play and indie support as conditional", () => {
  const history = getPlatformHistory("psvita");
  assert.ok(history);
  const sections = new Map(history.editorialSections?.map((section) => [section.id, section]) ?? []);
  const cross = sections.get("cross-platform");
  assert.match(cross?.paragraphsEs.join(" ") ?? "", /no como una promesa universal/i);
  assert.ok(cross?.cards.every((card) => /depend|no presente|no equivale/i.test(card.detailsEs.join(" "))));
  const remote = sections.get("remote-play");
  assert.match(remote?.paragraphsEs.join(" ") ?? "", /PS3 el soporte fue limitado/i);
  assert.match(remote?.paragraphsEs.join(" ") ?? "", /PS4.*mucho más profunda/i);
  assert.match(
    remote?.cards.find((card) => card.id === "vita-remote-portal")?.summaryEs ?? "",
    /(?:no.*sucesora|ni sucede)/i,
  );
  const indie = sections.get("indie");
  assert.match(indie?.paragraphsEs.join(" ") ?? "", /no se etiquetan en bloque como exclusivos/i);
  assert.match(history.services?.find((service) => service.id === "service-vita-near")?.statusLabelEs ?? "", /inactivo/i);
});

test("publishes only backed PS Vita people and exact credits", () => {
  assert.equal(peoplePsVita.profiles?.length, 3);
  assert.equal(peoplePsVita.profilePatches?.length, 0);
  assert.equal(peoplePsVita.historicalRelations?.length, 8);
  peoplePsVita.profiles?.forEach((profile) => assert.ok(getPublicPersonView(profile.slug), profile.slug));
  peoplePsVita.exactCredits?.forEach((work) => {
    assert.equal(work.relationshipPrecision, "EXACT_EDITORIAL_CREDIT", work.id);
    if (work.catalogId) assert.ok(catalogIds.has(work.catalogId), work.catalogId);
  });
  peoplePsVita.relatedWorks?.forEach((work) => {
    assert.equal(work.relationshipPrecision, "ASSOCIATION_NOT_EXACT_CREDIT", work.id);
  });
  const referenced = new Set<string>();
  for (const rows of [peoplePsVita.companyRelations ?? [], peoplePsVita.positions ?? [], peoplePsVita.exactCredits ?? [], peoplePsVita.relatedWorks ?? [], peoplePsVita.historicalRelations ?? []]) {
    rows.forEach((row) => referenced.add(row.sourceId));
  }
  peoplePsVita.profiles?.forEach((profile) => profile.sourceIds.forEach((id) => referenced.add(id)));
  referenced.forEach((id) => assert.ok(getPersonPublicSource(id), id));
});

test("keeps incomplete PS Vita identities and credits internal", () => {
  const publicPeople = new Set(getPublicPersonSlugs());
  for (const candidate of internalPsVita.peopleCandidates) {
    assert.equal(publicPeople.has(candidate.personSlug), false, candidate.personSlug);
  }
  assert.ok(internalPsVita.companyCandidates.some((item) => item.companySlug === "comcept"));
  assert.ok(internalPsVita.companyCandidates.some((item) => item.companySlug === "vlambeer"));
  assert.ok(internalPsVita.creditCandidates.some((item) => item.title.includes("LittleBigPlanet")));
  const fallbackSlugs = new Set(internalPsVita.mediaReferences.map((item) => item.personSlug));
  peoplePsVita.profiles?.forEach((profile) => {
    if (!profile.portrait) assert.ok(fallbackSlugs.has(profile.slug), profile.slug);
  });
  const loader = readFileSync("src/lib/person-public-research.ts", "utf8");
  assert.doesNotMatch(loader, /internal-candidates-psvita\.json/);
});
