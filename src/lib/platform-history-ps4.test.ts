import assert from "node:assert/strict";
import test from "node:test";
import { buildCompanyProfileView } from "./company-profile";
import {
  getCompanyGenealogyRelations,
  getPlatformHardwareGroup,
  getPlatformHistory,
} from "./platform-history";
import { getPublicPersonSlugs, getPublicPersonView } from "./person-public-research";

test("publishes the missing PlayStation 4 history from the supplied dossier", () => {
  const history = getPlatformHistory("ps4");
  assert.ok(history);
  assert.equal(history.title, "PlayStation 4");
  assert.equal(history.lastReviewed, "2026-09-15");
  assert.equal(history.figures.length, 6);
  assert.equal(history.architecture?.length, 4);
  assert.equal(history.companies.length, 10);
  assert.equal(history.companyGroups?.length, 3);
  assert.equal(history.hardware.length, 7);
  assert.equal(history.services?.length, 4);
  assert.equal(history.gameGroups?.flatMap((group) => group.games).length, 17);
  assert.equal(history.milestones.length, 12);
  assert.match(history.summaryParagraphsEs.join(" "), /117 millones/);
  assert.match(history.summaryParagraphsEs.join(" "), /29 de noviembre.*Europa/);
});

test("resolves every PS4 public entity and cited source", () => {
  const history = getPlatformHistory("ps4");
  assert.ok(history);
  const sourceIds = new Set(history.sources.map((source) => source.id));
  const people = new Set(getPublicPersonSlugs());
  const assertSources = (ids: string[]) => ids.forEach((id) => assert.ok(sourceIds.has(id), id));

  history.lineage?.links.forEach((link) => assertSources(link.sourceIds));
  history.figures.forEach((figure) => {
    assert.ok(people.has(figure.personSlug), figure.personSlug);
    assert.ok(getPublicPersonView(figure.personSlug), figure.personSlug);
    assertSources(figure.sourceIds);
  });
  history.architecture?.forEach((item) => {
    assertSources(item.sourceIds);
    item.partners.forEach((partner) => {
      if (partner.companySlug) assert.ok(buildCompanyProfileView(partner.companySlug), partner.companySlug);
    });
  });
  history.companies.forEach((company) => {
    assert.ok(buildCompanyProfileView(company.companySlug), company.companySlug);
    assertSources(company.sourceIds);
  });
  history.genealogies.forEach((relation) => {
    assert.ok(buildCompanyProfileView(relation.sourceCompanySlug), relation.sourceCompanySlug);
    if (relation.targetCompanySlug) assert.ok(buildCompanyProfileView(relation.targetCompanySlug));
    assert.ok(getCompanyGenealogyRelations(relation.sourceCompanySlug).some((item) => item.id === relation.id));
    assertSources(relation.sourceIds);
  });
  history.hardware.forEach((item) => {
    assertSources(item.sourceIds);
    item.relatedPersonSlugs.forEach((slug) => assert.ok(people.has(slug), slug));
  });
  history.services?.forEach((service) => assertSources(service.sourceIds));
  history.gameGroups?.flatMap((group) => group.games).forEach((game) => {
    game.companySlugs.forEach((slug) => assert.ok(buildCompanyProfileView(slug), slug));
    assertSources(game.sourceIds);
  });
  history.milestones.forEach((item) => assertSources(item.sourceIds));
});

test("keeps PS4 hardware and Insomniac timing precise", () => {
  const history = getPlatformHistory("ps4");
  assert.ok(history);
  const hardware = new Map(history.hardware.map((item) => [item.id, item]));
  assert.equal(hardware.get("hardware-ps4-slim")?.kind, "REDESIGN");
  assert.equal(hardware.get("hardware-ps4-pro")?.kind, "MID_GENERATION_UPGRADE");
  assert.equal(hardware.get("hardware-ps4-psvr")?.kind, "VR_HEADSET");
  assert.equal(getPlatformHardwareGroup("ps4", "hardware-ps4-dualshock4"), "controllers");
  assert.equal(getPlatformHardwareGroup("ps4", "hardware-ps4-psvr"), "peripherals");

  const insomniac = history.companies.find((company) => company.companySlug === "insomniac-games");
  assert.match(insomniac?.period ?? "", /anuncio de agosto de 2019/);
  assert.equal(history.genealogies[0]?.year, 2019);
  assert.equal(history.genealogies[0]?.relationshipType, "ACQUIRED_BY");
  const spiderMan = history.gameGroups?.flatMap((group) => group.games)
    .find((game) => game.title === "Marvel's Spider-Man");
  assert.equal(spiderMan?.relationshipType, "INDEPENDENT_PARTNER");
});
