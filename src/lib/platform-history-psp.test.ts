import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import catalogData from "../../data/catalog.json";
import internalPspData from "../../data/research/platform-history/internal-candidates-psp.json";
import peoplePspData from "../../data/research/platform-history/people-psp-public.json";
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
const peoplePsp = peoplePspData as unknown as PersonPublicOverlayData;
const internalPsp = internalPspData as {
  peopleCandidates: { personSlug: string; status: string }[];
  creditCandidates: { title: string; status: string }[];
  mediaReferences: { personSlug: string; status: string }[];
};

test("publishes PSP as a complete platform between PS2 and PS3", () => {
  const history = getPlatformHistory("psp");
  assert.ok(history);
  assert.equal(history.title, "PlayStation Portable");
  assert.equal(history.figures.length, 7);
  assert.equal(history.architecture?.length, 3);
  assert.equal(history.companies.length, 12);
  assert.equal(history.companyGroups?.length, 2);
  assert.equal(history.gameGroups?.flatMap((group) => group.games).length, 17);
  assert.equal(history.hardware.length, 5);
  assert.equal(history.services?.length, 4);
  assert.equal(history.milestones.length, 11);
  assert.equal(history.sources.length, 9);
  assert.ok((history.historyParagraphsEs?.length ?? 0) >= 5);
  assert.match(history.dekEs, /plataforma completa/i);
});

test("resolves every PSP public relation, source and catalog link", () => {
  const history = getPlatformHistory("psp");
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
      getCompanyPlatformHistoryLinks(company.companySlug).some((link) => link.platformSlug === "psp"),
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
    section.cards.forEach((card) => assertSources(card.sourceIds));
  });
  history.milestones.forEach((milestone) => assertSources(milestone.sourceIds));
});

test("models every PSP revision without creating false successors", () => {
  const history = getPlatformHistory("psp");
  assert.ok(history);
  const hardware = new Map(history.hardware.map((item) => [item.id, item]));
  assert.equal(hardware.get("hardware-psp-1000")?.kind, "BASE_MODEL");
  assert.equal(hardware.get("hardware-psp-go")?.kind, "DIGITAL_ONLY_REDESIGN");
  assert.match(hardware.get("hardware-psp-go")?.summaryEs ?? "", /No es una sucesora/i);
  assert.ok(hardware.get("hardware-psp-go")?.features.some((item) => /Sin unidad UMD/i.test(item)));
  assert.ok(hardware.get("hardware-psp-street")?.features.some((item) => /Sin Wi-Fi/i.test(item)));
  assert.equal(getPlatformHardwareGroup("psp", "hardware-psp-go"), "models");
});

test("keeps UMD, Memory Stick and Remote Play within their PSP boundaries", () => {
  const history = getPlatformHistory("psp");
  assert.ok(history);
  const architecture = new Map((history.architecture ?? []).map((item) => [item.id, item]));
  assert.match(architecture.get("architecture-psp-umd")?.summaryEs ?? "", /no se traslada a PS Vita/i);
  assert.ok(architecture.get("architecture-psp-memory-stick")?.features.some((item) => /No equivale.*PS Vita/i.test(item)));
  const remotePlay = history.services?.find((service) => service.id === "service-psp-remote-play");
  assert.match(remotePlay?.statusLabelEs ?? "", /soporte limitado/i);
  assert.match(remotePlay?.summaryEs ?? "", /PS3/i);
});

test("protects first-party and independent company identities", () => {
  const history = getPlatformHistory("psp");
  assert.ok(history);
  const companies = new Map(history.companies.map((company) => [company.companySlug, company]));
  for (const slug of ["japan-studio", "bend-studio", "polyphony-digital", "guerrilla-games", "sce-cambridge-studio"]) {
    assert.equal(companies.get(slug)?.relationshipType, "FIRST_PARTY", slug);
  }
  assert.equal(companies.get("ready-at-dawn")?.relationshipType, "KEY_DEVELOPER");
  assert.match(companies.get("ready-at-dawn")?.contributionEs ?? "", /no first party/i);
  for (const slug of ["capcom", "square-enix", "konami", "rockstar-games", "atlus"]) {
    assert.equal(companies.get(slug)?.relationshipType, "KEY_PUBLISHER", slug);
  }
});

test("publishes only backed PSP people and exact credits", () => {
  assert.equal(peoplePsp.profiles?.length, 2);
  assert.equal(peoplePsp.profilePatches?.length, 0);
  assert.equal(peoplePsp.historicalRelations?.length, 7);
  peoplePsp.profiles?.forEach((profile) => assert.ok(getPublicPersonView(profile.slug), profile.slug));
  peoplePsp.exactCredits?.forEach((work) => {
    assert.equal(work.relationshipPrecision, "EXACT_EDITORIAL_CREDIT", work.id);
    if (work.catalogId) assert.ok(catalogIds.has(work.catalogId), work.catalogId);
  });
  peoplePsp.relatedWorks?.forEach((work) => {
    assert.equal(work.relationshipPrecision, "ASSOCIATION_NOT_EXACT_CREDIT", work.id);
  });
  const referenced = new Set<string>();
  for (const rows of [peoplePsp.companyRelations ?? [], peoplePsp.positions ?? [], peoplePsp.exactCredits ?? [], peoplePsp.relatedWorks ?? [], peoplePsp.historicalRelations ?? []]) {
    rows.forEach((row) => referenced.add(row.sourceId));
  }
  peoplePsp.profiles?.forEach((profile) => profile.sourceIds.forEach((id) => referenced.add(id)));
  referenced.forEach((id) => assert.ok(getPersonPublicSource(id), id));
});

test("keeps weak biographies and unverified PSP credits internal", () => {
  const publicPeople = new Set(getPublicPersonSlugs());
  for (const candidate of internalPsp.peopleCandidates) {
    assert.equal(publicPeople.has(candidate.personSlug), false, candidate.personSlug);
  }
  assert.ok(internalPsp.creditCandidates.some((item) => item.title.includes("Portable Ops")));
  const fallbackSlugs = new Set(internalPsp.mediaReferences.map((item) => item.personSlug));
  peoplePsp.profiles?.forEach((profile) => {
    if (!profile.portrait) assert.ok(fallbackSlugs.has(profile.slug), profile.slug);
  });
  const loader = readFileSync("src/lib/person-public-research.ts", "utf8");
  assert.doesNotMatch(loader, /internal-candidates-psp\.json/);
});
