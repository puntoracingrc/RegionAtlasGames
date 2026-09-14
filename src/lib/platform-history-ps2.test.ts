import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import catalogData from "../../data/catalog.json";
import companiesData from "../../data/index/companies.json";
import internalPs1Data from "../../data/research/platform-history/internal-candidates.json";
import internalPs2Data from "../../data/research/platform-history/internal-candidates-ps2.json";
import peoplePs2Data from "../../data/research/platform-history/people-ps2-public.json";
import {
  getCompanyGenealogyRelations,
  getCompanyPlatformHistoryLinks,
  getPlatformHardwareGroup,
  getPlatformHistory,
} from "./platform-history";
import {
  getPublicPersonSlugs,
  getPublicPersonView,
} from "./person-public-research";
import type { PersonPublicOverlayData } from "./person-research-types";
import type { CatalogGame } from "./types";

const catalog = catalogData as CatalogGame[];
const catalogIds = new Set(catalog.map((game) => game.id));
const companies = companiesData as Record<string, unknown>;
const peoplePs2 = peoplePs2Data as unknown as PersonPublicOverlayData;
const internalPs1 = internalPs1Data as {
  records: {
    slug: string;
    platformSlugs: string[];
    sourceIds: string[];
  }[];
};
const internalPs2 = internalPs2Data as {
  records: {
    slug: string;
    status: "NEW_INTERNAL_CANDIDATE" | "REUSED_INTERNAL_CANDIDATE";
  }[];
  mediaReferences: {
    personSlug: string;
    status: string;
    urls: string[];
  }[];
};

test("publishes the complete documented PlayStation 2 history model", () => {
  const history = getPlatformHistory("ps2");
  assert.ok(history);
  assert.equal(history.figures.length, 7);
  assert.equal(history.companies.length, 17);
  assert.equal(history.genealogies.length, 8);
  assert.equal(history.hardware.length, 24);
  assert.equal(history.milestones.length, 19);
  assert.equal(history.sources.length, 8);
  assert.ok(history.summaryParagraphsEs.length >= 4);
  assert.ok(history.legacyEs.length >= 3);
});

test("resolves every PS2 person, company, catalog game and source link", () => {
  const history = getPlatformHistory("ps2");
  assert.ok(history);
  const publicPeople = new Set(getPublicPersonSlugs());
  const sourceIds = new Set(history.sources.map((source) => source.id));
  const hardwareIds = new Set(history.hardware.map((item) => item.id));

  assert.equal(hardwareIds.size, history.hardware.length);
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
        (link) => link.platformSlug === "ps2",
      ),
      company.companySlug,
    );
  }
  for (const item of history.hardware) {
    if (item.manufacturerCompanySlug) {
      assert.ok(companies[item.manufacturerCompanySlug], item.manufacturerCompanySlug);
      assert.ok(item.manufacturerCompanyName, item.id);
    } else {
      assert.equal(item.manufacturerCompanyName, null, item.id);
    }
    item.sourceIds.forEach((sourceId) => assert.ok(sourceIds.has(sourceId), sourceId));
    item.relatedPersonSlugs.forEach((slug) => assert.ok(publicPeople.has(slug), slug));
    for (const game of item.relatedCatalogEntries ?? []) {
      assert.ok(catalogIds.has(game.id), game.id);
    }
  }
  for (const milestone of history.milestones) {
    milestone.sourceIds.forEach((sourceId) => assert.ok(sourceIds.has(sourceId), sourceId));
  }
});

test("keeps PS2 company genealogy explicit and non-destructive", () => {
  const history = getPlatformHistory("ps2");
  assert.ok(history);
  const relationIds = new Set(history.genealogies.map((relation) => relation.id));
  assert.equal(relationIds.size, history.genealogies.length);

  for (const relation of history.genealogies) {
    assert.ok(companies[relation.sourceCompanySlug], relation.sourceCompanySlug);
    if (relation.targetCompanySlug) {
      assert.ok(companies[relation.targetCompanySlug], relation.targetCompanySlug);
      assert.notEqual(relation.sourceCompanySlug, relation.targetCompanySlug, relation.id);
    }
    assert.ok(
      getCompanyGenealogyRelations(relation.sourceCompanySlug).some(
        (candidate) => candidate.id === relation.id,
      ),
      relation.id,
    );
  }

  assert.ok(relationIds.has("PHG-PS2-JAPAN-STUDIO-ASOBI"));
  assert.ok(relationIds.has("PHG-PS2-TEAM-SOHO-LONDON"));
  assert.ok(relationIds.has("PHG-PS2-NAUGHTY-DOG-SONY"));
  assert.ok(relationIds.has("PHG-PS2-NAMCO-BANDAI-NAMCO"));
});

test("publishes four new people, patches three reused profiles and preserves internal candidates", () => {
  assert.deepEqual(
    peoplePs2.profiles?.map((profile) => profile.slug),
    ["kazuo-hirai", "shuhei-yoshida", "chris-deering", "tetsuya-iida-sce"],
  );
  assert.deepEqual(
    peoplePs2.profilePatches?.map((profile) => profile.slug),
    ["ken-kutaragi", "phil-harrison", "james-armstrong"],
  );
  for (const patch of peoplePs2.profilePatches ?? []) {
    assert.ok(getPublicPersonView(patch.slug), patch.slug);
  }

  const maria = internalPs1.records.find(
    (candidate) => candidate.slug === "maria-jesus-lopez-playstation",
  );
  assert.deepEqual(maria?.platformSlugs, ["ps1", "ps2"]);
  assert.deepEqual(maria?.sourceIds, ["PH-PS1-PEOPLE", "PH-PS2-PEOPLE"]);
  assert.deepEqual(
    internalPs2.records.map((candidate) => candidate.slug),
    ["allan-becker", "maria-jesus-lopez-playstation"],
  );
  for (const candidate of internalPs2.records) {
    assert.equal(getPublicPersonView(candidate.slug), undefined, candidate.slug);
  }
});

test("keeps contextual games as associations while making their catalog pages navigable", () => {
  assert.equal(peoplePs2.exactCredits?.length, 0);
  assert.equal(peoplePs2.relatedWorks?.length, 6);
  for (const work of peoplePs2.relatedWorks ?? []) {
    assert.equal(work.relationshipPrecision, "ASSOCIATION_NOT_EXACT_CREDIT", work.id);
    if (work.catalogId) assert.ok(catalogIds.has(work.catalogId), work.catalogId);
    const view = getPublicPersonView(work.personSlug);
    assert.ok(view, work.personSlug);
    assert.ok(view.relatedWorks.some((candidate) => candidate.id === work.id), work.id);
  }
});

test("connects PS2 people to platform, hardware and companies with resolvable reverse links", () => {
  const history = getPlatformHistory("ps2");
  assert.ok(history);
  const sourceIds = new Set([
    ...history.sources.map((source) => source.id),
    ...(peoplePs2.sources ?? []).map((source) => source.id),
  ]);

  for (const relation of peoplePs2.companyRelations ?? []) {
    assert.ok(companies[relation.companySlug], relation.companySlug);
    assert.ok(sourceIds.has(relation.sourceId), relation.sourceId);
    assert.equal(relation.verificationStatus, "INDEPENDENT_SOURCE_VERIFIED");
  }
  for (const relation of peoplePs2.historicalRelations ?? []) {
    assert.ok(sourceIds.has(relation.sourceId), relation.sourceId);
    if (relation.targetType === "platform") {
      assert.ok(getPlatformHistory(relation.targetSlug), relation.targetSlug);
    }
    if (relation.targetType === "hardware") {
      assert.ok(
        history.hardware.some((item) => item.id === relation.targetSlug),
        relation.targetSlug,
      );
      assert.ok(getPlatformHardwareGroup("ps2", relation.targetSlug), relation.targetSlug);
    }
  }

  assert.equal(
    getPlatformHardwareGroup("ps2", "hardware-ps2-singstar-microphones"),
    "peripherals",
  );
});

test("uses only licensed local portraits and records restricted images as internal references", () => {
  const kaz = getPublicPersonView("kazuo-hirai")?.profile;
  const shuhei = getPublicPersonView("shuhei-yoshida")?.profile;
  assert.equal(kaz?.portrait?.path, "/person-portraits/kazuo-hirai.jpg");
  assert.equal(kaz?.portrait?.license, "CC BY-SA 2.0");
  assert.equal(shuhei?.portrait?.path, "/person-portraits/shuhei-yoshida.jpg");
  assert.equal(shuhei?.portrait?.license, "CC BY-SA 3.0");
  assert.ok(existsSync(`public${kaz?.portrait?.path}`));
  assert.ok(existsSync(`public${shuhei?.portrait?.path}`));

  for (const slug of ["chris-deering", "james-armstrong", "tetsuya-iida-sce"]) {
    assert.equal(getPublicPersonView(slug)?.profile.portrait, null, slug);
  }
  const tetsuyaMedia = internalPs2.mediaReferences.find(
    (item) => item.personSlug === "tetsuya-iida-sce",
  );
  assert.equal(tetsuyaMedia?.status, "NO_LICENSED_PORTRAIT_FOUND");
  assert.match(JSON.stringify(tetsuyaMedia), /deportista homónimo/);
  assert.doesNotMatch(JSON.stringify(peoplePs2), /HAWKS-Iida|Iida tetsuya\.jpg/);
});

test("does not expose internal PS2 candidates through public loaders", () => {
  const loader = readFileSync("src/lib/person-public-research.ts", "utf-8");
  assert.doesNotMatch(loader, /internal-candidates(?:-ps2)?\.json/);
});
