import assert from "node:assert/strict";
import test from "node:test";
import catalogData from "../../data/catalog.json";
import companiesData from "../../data/index/companies.json";
import internalCandidatesData from "../../data/research/platform-history/internal-candidates.json";
import peoplePublicData from "../../data/research/platform-history/people-public.json";
import {
  getCompanyGenealogyRelations,
  getCompanyPlatformHistoryLinks,
  getPlatformHardwareGroup,
  getPlatformHistory,
  getPlatformHistoryData,
  parsePlatformHardwareGroup,
} from "./platform-history";
import {
  getPublicPersonSlugs,
  getPublicPersonView,
} from "./person-public-research";
import type { PersonPublicData } from "./person-research-types";
import type { CatalogGame } from "./types";

const peoplePublic = peoplePublicData as unknown as PersonPublicData;
const companies = companiesData as Record<string, unknown>;
const catalog = catalogData as CatalogGame[];
const catalogIds = new Set(catalog.map((game) => game.id));
const internalCandidates = internalCandidatesData as {
  records: {
    slug: string;
    status: "EXISTING_INTERNAL_IDENTITY" | "NEW_INTERNAL_CANDIDATE";
  }[];
};

test("publishes reusable structured history for PS1 and keeps an empty fallback", () => {
  const history = getPlatformHistory("ps1");
  assert.ok(history);
  assert.equal(getPlatformHistory("snes"), undefined);
  assert.equal(getPlatformHistoryData().platforms.length, 1);
  assert.equal(history.figures.length, 7);
  assert.equal(history.companies.length, 16);
  assert.equal(history.genealogies.length, 7);
  assert.equal(history.hardware.length, 23);
  assert.ok(history.milestones.length >= 10);
  assert.ok(history.summaryParagraphsEs.length >= 4);
  assert.ok(history.legacyEs.length >= 3);
});

test("keeps every platform-history identity and source reference resolvable", () => {
  const history = getPlatformHistory("ps1");
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
        (link) => link.platformSlug === "ps1",
      ),
      company.companySlug,
    );
  }
  for (const item of history.hardware) {
    assert.ok(companies[item.manufacturerCompanySlug], item.manufacturerCompanySlug);
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

test("models the three required corporate genealogies without destructive aliases", () => {
  const history = getPlatformHistory("ps1");
  assert.ok(history);
  const genealogyIds = new Set(history.genealogies.map((relation) => relation.id));
  assert.equal(genealogyIds.size, history.genealogies.length);

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

  assert.ok(genealogyIds.has("PHG-PS1-POLYS-POLYPHONY"));
  assert.ok(genealogyIds.has("PHG-PS1-PSYGNOSIS-LIVERPOOL"));
  assert.ok(genealogyIds.has("PHG-PS1-SQUARE-SQUAREENIX"));
  assert.ok(genealogyIds.has("PHG-PS1-ENIX-SQUAREENIX"));
});

test("publishes only the seven audited PS1 figures and preserves internal candidates", () => {
  assert.equal(peoplePublic.profiles.length, 7);
  assert.equal(new Set(peoplePublic.profiles.map((profile) => profile.slug)).size, 7);
  assert.equal(peoplePublic.historicalRelations?.length, 9);

  const published = new Set(getPublicPersonSlugs());
  const newCandidates = internalCandidates.records.filter(
    (candidate) => candidate.status === "NEW_INTERNAL_CANDIDATE",
  );
  assert.equal(internalCandidates.records.length, 13);
  assert.ok(newCandidates.length > 0);
  for (const candidate of newCandidates) {
    assert.equal(published.has(candidate.slug), false, candidate.slug);
    assert.equal(getPublicPersonView(candidate.slug), undefined, candidate.slug);
  }

  const james = getPublicPersonView("james-armstrong");
  const geoff = getPublicPersonView("geoff-glendenning");
  assert.equal(james?.profile.qid, null);
  assert.equal(geoff?.profile.qid, null);
  assert.equal(james?.profile.portrait, null);
  assert.equal(geoff?.profile.portrait, null);
});

test("connects people to companies, platform and hardware with explicit sources", () => {
  const overlaySourceIds = new Set(peoplePublic.sources.map((source) => source.id));
  const relationIds = new Set<string>();

  for (const relation of peoplePublic.companyRelations) {
    assert.equal(relationIds.has(relation.id), false, relation.id);
    relationIds.add(relation.id);
    assert.ok(companies[relation.companySlug], relation.companySlug);
    assert.ok(overlaySourceIds.has(relation.sourceId), relation.sourceId);
    assert.equal(relation.verificationStatus, "INDEPENDENT_SOURCE_VERIFIED");
  }
  for (const relation of peoplePublic.historicalRelations ?? []) {
    assert.equal(relationIds.has(relation.id), false, relation.id);
    relationIds.add(relation.id);
    assert.ok(overlaySourceIds.has(relation.sourceId), relation.sourceId);
    if (relation.targetType === "person") {
      assert.ok(getPublicPersonView(relation.targetSlug), relation.targetSlug);
    }
    if (relation.targetType === "platform") {
      assert.ok(getPlatformHistory(relation.targetSlug), relation.targetSlug);
    }
    if (relation.targetType === "hardware") {
      assert.ok(
        getPlatformHistory(relation.platformSlug ?? "")?.hardware.some(
          (item) => item.id === relation.targetSlug,
        ),
        relation.targetSlug,
      );
      assert.ok(
        getPlatformHardwareGroup(relation.platformSlug ?? "", relation.targetSlug),
        relation.targetSlug,
      );
    }
  }
});

test("resolves hardware deep links to a valid selector without accepting unknown values", () => {
  assert.equal(
    getPlatformHardwareGroup("ps1", "hardware-ps1-controller"),
    "controllers",
  );
  assert.equal(parsePlatformHardwareGroup("controllers"), "controllers");
  assert.equal(parsePlatformHardwareGroup("unknown"), undefined);
  assert.equal(getPlatformHardwareGroup("ps1", "unknown"), undefined);
});

test("keeps licensed portraits local and leaves unlicensed portraits empty", () => {
  const phil = getPublicPersonView("phil-harrison")?.profile;
  const kazunori = getPublicPersonView("kazunori-yamauchi")?.profile;
  assert.equal(phil?.portrait?.path, "/person-portraits/phil-harrison.webp");
  assert.equal(phil?.portrait?.license, "CC BY 2.0");
  assert.equal(kazunori?.portrait?.path, "/person-portraits/kazunori-yamauchi.webp");
  assert.equal(kazunori?.portrait?.license, "CC BY-SA 4.0");
  for (const slug of ["norio-ohga", "james-armstrong", "geoff-glendenning", "teiyu-goto"]) {
    assert.equal(getPublicPersonView(slug)?.profile.portrait, null, slug);
  }
});
