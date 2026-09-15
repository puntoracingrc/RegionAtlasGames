import assert from "node:assert/strict";
import test from "node:test";
import candidatesData from "../../data/research/platform-history/internal-candidates-snk.json";
import platformsData from "../../data/platforms.json";
import { buildCompanyProfileView } from "./company-profile";
import { getCatalogGame, getPlatform, hasPublicCatalogGames } from "./catalog";
import {
  getCompanyGenealogyRelations,
  getPlatformHardwareGroup,
  getPlatformHistory,
} from "./platform-history";
import { getPublicPersonSlugs, getPublicPersonView } from "./person-public-research";
import type { PlatformHistory } from "./platform-history-types";
import type { Platform } from "./types";

const slugs = ["neogeo", "neogeocd", "hyper-neogeo-64", "neogeopocket"];
const platforms = platformsData as Platform[];

function assertSourceReferences(history: PlatformHistory) {
  const sources = new Set(history.sources.map((source) => source.id));
  const check = (sourceIds: string[]) => {
    assert.ok(sourceIds.length > 0);
    sourceIds.forEach((sourceId) => assert.ok(sources.has(sourceId), `${history.platformSlug}:${sourceId}`));
  };

  history.figures.forEach((item) => check(item.sourceIds));
  history.architecture?.forEach((item) => check(item.sourceIds));
  history.companies.forEach((item) => check(item.sourceIds));
  history.genealogies.forEach((item) => check(item.sourceIds));
  history.gameGroups?.flatMap((group) => group.games).forEach((item) => check(item.sourceIds));
  history.hardware.forEach((item) => check(item.sourceIds));
  history.compatibilityLinks?.forEach((item) => check(item.sourceIds));
  history.editorialSections?.forEach((section) => {
    check(section.sourceIds);
    section.cards.forEach((card) => check(card.sourceIds));
  });
  history.milestones.forEach((item) => check(item.sourceIds));
}

test("publishes four distinct Neo Geo histories under reusable platform identities", () => {
  for (const slug of slugs) {
    assert.ok(getPlatform(slug), slug);
    const history = getPlatformHistory(slug);
    assert.ok(history, slug);
    assert.ok(history.summaryParagraphsEs.length >= 4, slug);
    assert.ok(history.milestones.length >= 4, slug);
    assertSourceReferences(history);
  }

  assert.match(getPlatformHistory("neogeo")?.title ?? "", /MVS y AES/);
  assert.match(getPlatformHistory("neogeocd")?.title ?? "", /CDZ/);
  assert.match(getPlatformHistory("neogeopocket")?.title ?? "", /Pocket Color/);
  assert.equal(getPlatform("hyper-neogeo-64")?.releaseYear, 1997);
  assert.equal(hasPublicCatalogGames("hyper-neogeo-64"), false);
});

test("keeps AES+ announced, dated and outside the public catalog", () => {
  const aesPlus = platforms.find((platform) => platform.slug === "neogeo-aes-plus");
  assert.ok(aesPlus);
  assert.equal(aesPlus.status, "announced");
  assert.equal(aesPlus.active, false);
  assert.equal(aesPlus.announcedReleaseDate, "2027-09-16");
  assert.equal(hasPublicCatalogGames("neogeo-aes-plus"), false);

  const history = getPlatformHistory("neogeo");
  const hardware = history?.hardware.find((item) => item.id === "hardware-neogeo-aes-plus");
  assert.equal(hardware?.kind, "ANNOUNCED_HARDWARE");
  assert.match(hardware?.summaryEs ?? "", /no se trata como plataforma ya lanzada/);
});

test("keeps every Neo Geo branch inside its documented hardware boundary", () => {
  const neoGeo = getPlatformHistory("neogeo");
  const neoGeoCd = getPlatformHistory("neogeocd");
  const hyper = getPlatformHistory("hyper-neogeo-64");
  const pocket = getPlatformHistory("neogeopocket");
  assert.ok(neoGeo);
  assert.ok(neoGeoCd);
  assert.ok(hyper);
  assert.ok(pocket);

  assert.ok(neoGeo.hardware.some((item) => item.id === "hardware-neogeo-mvs-1-slot"));
  assert.ok(neoGeo.hardware.some((item) => item.id === "hardware-neogeo-aes"));
  assert.match(neoGeo.summaryParagraphsEs.join(" "), /no significa.*intercambiables/i);

  assert.equal(
    neoGeoCd.hardware.find((item) => item.id === "hardware-neogeocdz")?.kind,
    "REDESIGN",
  );
  assert.equal(neoGeoCd.compatibilityLinks?.length ?? 0, 0);
  const neoGeoCdBoundaryText = [
    ...neoGeoCd.summaryParagraphsEs,
    ...(neoGeoCd.architecture ?? []).flatMap((item) => [item.summaryEs, ...item.features]),
    ...neoGeoCd.hardware.flatMap((item) => [item.summaryEs, ...item.features]),
    ...neoGeoCd.legacyEs,
  ].join(" ");
  assert.match(neoGeoCdBoundaryText, /(?:sin compatibilidad|no admite|no es.*compatible).*cartuchos/i);

  assert.equal(hyper.hardware.length, 1);
  assert.match(hyper.hardware[0]?.summaryEs ?? "", /arcade/i);
  assert.equal(hyper.compatibilityLinks?.length ?? 0, 0);
  assert.equal(hyper.gameGroups?.flatMap((group) => group.games).length, 7);

  assert.equal(
    pocket.hardware.find((item) => item.id === "hardware-neogeo-pocket-color")?.kind,
    "REVISION",
  );
  assert.equal(
    pocket.hardware.find((item) => item.id === "hardware-new-neogeo-pocket-color")?.kind,
    "REDESIGN",
  );
  const dreamcastLink = pocket.compatibilityLinks?.find(
    (item) => item.id === "compat-pocket-dreamcast",
  );
  assert.ok(dreamcastLink);
  assert.match(dreamcastLink.summaryEs, /selección de juegos compatibles/i);
  assert.ok(dreamcastLink.features.some((feature) => /no implica soporte universal/i.test(feature)));
});

test("models SNK legal succession without merging the original company into the current one", () => {
  const history = getPlatformHistory("neogeo");
  assert.ok(history);
  const succession = history.genealogies.find((relation) => relation.id === "PHG-SNK-IP-PLAYMORE");
  assert.equal(succession?.relationshipType, "IP_SUCCEEDED_BY");
  assert.equal(succession?.sourceCompanySlug, "snk-original");
  assert.equal(succession?.targetCompanySlug, "playmore");
  assert.equal(
    history.genealogies.some(
      (relation) =>
        relation.sourceCompanySlug === "snk-original" && relation.relationshipType === "RENAMED_TO",
    ),
    false,
  );
  assert.ok(getCompanyGenealogyRelations("snk").some((relation) => relation.id === "PHG-SNK-PLAYMORE-SNK"));
});

test("resolves people, companies, hardware and catalog links across all four histories", () => {
  for (const slug of slugs) {
    const history = getPlatformHistory(slug);
    assert.ok(history);
    history.figures.forEach((figure) => assert.ok(getPublicPersonView(figure.personSlug), figure.personSlug));
    history.companies.forEach((company) => assert.ok(buildCompanyProfileView(company.companySlug), company.companySlug));
    history.gameGroups?.flatMap((group) => group.games).forEach((game) => {
      if (game.catalogId) assert.ok(getCatalogGame(game.catalogId), game.catalogId);
      game.companySlugs.forEach((companySlug) => assert.ok(buildCompanyProfileView(companySlug), companySlug));
    });
    history.hardware.forEach((hardware) => {
      assert.ok(getPlatformHardwareGroup(slug, hardware.id), hardware.id);
      hardware.relatedPersonSlugs.forEach((personSlug) => assert.ok(getPublicPersonView(personSlug), personSlug));
    });
  }
});

test("publishes six supported SNK people and keeps unresolved identities internal", () => {
  const publicSlugs = new Set(getPublicPersonSlugs());
  for (const slug of [
    "eikichi-kawasaki",
    "takashi-nishiyama",
    "hiroshi-matsumoto",
    "shinkiro",
    "hiroaki",
    "yasuyuki-oda",
  ]) {
    assert.ok(publicSlugs.has(slug), slug);
  }

  for (const candidate of candidatesData.peopleCandidates) {
    assert.equal(publicSlugs.has(candidate.personSlug), false, candidate.personSlug);
  }
  assert.equal(getPublicPersonView("hiroaki")?.profile.qid, null);
  assert.match(getPublicPersonView("hiroaki")?.profile.biographyEs ?? "", /no infiere un nombre civil/i);
});
