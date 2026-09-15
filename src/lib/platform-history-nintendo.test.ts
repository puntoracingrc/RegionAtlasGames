import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import catalogPlatformsData from "../../data/platforms.json";
import companyData from "../../data/research/platform-history/company-nintendo-public.json";
import internalData from "../../data/research/platform-history/internal-candidates-nintendo.json";
import peopleData from "../../data/research/platform-history/people-nintendo-public.json";
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
import type { PlatformHistory } from "./platform-history-types";
import type { PersonPublicOverlayData } from "./person-research-types";
import type { Platform } from "./types";

const nintendoPlatformSlugs = [
  "gameandwatch",
  "nes",
  "gameboy",
  "snes",
  "virtualboy",
  "n64",
  "gba",
  "gamecube",
  "ds",
  "wii",
  "3ds",
  "wiiu",
  "switch",
  "switch2",
] as const;

const people = peopleData as unknown as PersonPublicOverlayData;
const catalogPlatforms = catalogPlatformsData as Platform[];
const internal = internalData as {
  peopleCandidates: { personSlug: string }[];
  companyCandidates: { companySlug: string; status: string }[];
  creditCandidates: { title: string; status: string }[];
  hardwareCandidates: { id: string; status: string }[];
  mediaReferences: { personSlug: string; status: string }[];
};
const company = companyData as {
  achievements: { id: string; sourceId: string }[];
  sources: { id: string }[];
};

function assertHistorySourcesResolve(history: PlatformHistory): void {
  const sourceIds = new Set(history.sources.map((source) => source.id));
  const assertSources = (ids: string[]) => {
    ids.forEach((id) => assert.ok(sourceIds.has(id), `${history.platformSlug}:${id}`));
  };

  history.lineage?.links.forEach((item) => assertSources(item.sourceIds));
  if (history.generationStatus) assertSources(history.generationStatus.sourceIds);
  history.figures.forEach((item) => assertSources(item.sourceIds));
  history.architecture?.forEach((item) => assertSources(item.sourceIds));
  history.companies.forEach((item) => assertSources(item.sourceIds));
  history.genealogies.forEach((item) => assertSources(item.sourceIds));
  history.gameGroups?.flatMap((group) => group.games).forEach((item) => assertSources(item.sourceIds));
  history.hardware.forEach((item) => assertSources(item.sourceIds));
  history.services?.forEach((item) => assertSources(item.sourceIds));
  history.compatibilityLinks?.forEach((item) => assertSources(item.sourceIds));
  history.editorialSections?.forEach((section) => {
    assertSources(section.sourceIds);
    section.cards.forEach((card) => assertSources(card.sourceIds));
  });
  history.milestones.forEach((item) => assertSources(item.sourceIds));
}

test("publishes the two Nintendo branches and their Switch convergence", () => {
  const histories = nintendoPlatformSlugs.map((slug) => getPlatformHistory(slug));
  histories.forEach((history, index) => {
    assert.ok(history, nintendoPlatformSlugs[index]);
    assert.ok(history.summaryParagraphsEs.length >= 3, history.platformSlug);
    assert.ok(history.figures.length >= 3, history.platformSlug);
    assert.ok(history.companies.length >= 3, history.platformSlug);
    assert.ok(history.hardware.length >= 2, history.platformSlug);
    assert.ok(history.lineage, history.platformSlug);
    assertHistorySourcesResolve(history);
    history.lineage?.links.forEach((link) => {
      assert.ok(getPlatformHistory(link.platformSlug), `${history.platformSlug}:${link.platformSlug}`);
    });
  });

  const switchHistory = getPlatformHistory("switch");
  assert.ok(switchHistory);
  const convergence = switchHistory.lineage?.links.filter(
    (link) => link.relationship === "CONVERGENCE",
  );
  assert.deepEqual(
    convergence?.map((link) => link.platformSlug).sort(),
    ["3ds", "wiiu"],
  );
});

test("keeps editorial hardware history out of catalog platform filters", () => {
  const catalogSlugs = new Set(catalogPlatforms.map((platform) => platform.slug));
  for (const slug of ["gameandwatch", "virtualboy"]) {
    const history = getPlatformHistory(slug);
    assert.ok(history?.editorialIdentity, slug);
    assert.equal(catalogSlugs.has(slug), false, slug);
  }
  assert.equal(getPlatformHistory("fds"), undefined);
  assert.equal(getPlatformHistory("64dd"), undefined);
  assert.equal(getPlatformHistory("gameboy-player"), undefined);
});

test("resolves every Nintendo figure, company and game company through public links", () => {
  const publicPeople = new Set(getPublicPersonSlugs());
  for (const platformSlug of nintendoPlatformSlugs) {
    const history = getPlatformHistory(platformSlug);
    assert.ok(history);
    history.figures.forEach((figure) => {
      assert.ok(publicPeople.has(figure.personSlug), figure.personSlug);
      const view = getPublicPersonView(figure.personSlug);
      assert.ok(view, figure.personSlug);
      assert.ok(
        view.historicalRelations.some(
          (relation) => relation.targetType === "platform" && relation.targetSlug === platformSlug,
        ),
        `${figure.personSlug}:${platformSlug}`,
      );
    });
    history.companies.forEach((entry) => {
      assert.ok(buildCompanyProfileView(entry.companySlug), entry.companySlug);
      assert.ok(
        getCompanyPlatformHistoryLinks(entry.companySlug).some(
          (link) => link.platformSlug === platformSlug,
        ),
        `${platformSlug}:${entry.companySlug}`,
      );
    });
    history.gameGroups?.flatMap((group) => group.games).forEach((game) => {
      game.companySlugs.forEach((slug) => assert.ok(buildCompanyProfileView(slug), slug));
    });
  }
});

test("protects Nintendo family, expansion and compatibility boundaries", () => {
  const nes = getPlatformHistory("nes");
  const gameBoy = getPlatformHistory("gameboy");
  const snes = getPlatformHistory("snes");
  const virtualBoy = getPlatformHistory("virtualboy");
  const n64 = getPlatformHistory("n64");
  const gba = getPlatformHistory("gba");
  const gameCube = getPlatformHistory("gamecube");
  assert.ok(nes && gameBoy && snes && virtualBoy && n64 && gba && gameCube);

  assert.equal(nes.hardware.find((item) => item.id === "hardware-famicom-disk-system")?.kind, "HARDWARE_EXPANSION");
  assert.equal(gameBoy.hardware.find((item) => item.id === "hardware-gameboy-color")?.kind, "SUCCESSOR_PLATFORM");
  assert.equal(gameBoy.hardware.find((item) => item.id === "hardware-super-gameboy")?.kind, "PERIPHERAL");
  assert.match(JSON.stringify(snes), /Rare.*independiente|independiente.*Rare/i);
  assert.equal(snes.architecture?.find((item) => item.id === "architecture-snes-superfx")?.partners.some((partner) => partner.companySlug === "argonaut-software"), true);
  assert.equal(virtualBoy.lineage?.links.find((link) => link.platformSlug === "3ds")?.relationship, "INFLUENCE");
  assert.match(JSON.stringify(virtualBoy), /no.*portátil de mano convencional/i);
  assert.equal(n64.hardware.find((item) => item.id === "hardware-64dd")?.kind, "HARDWARE_EXPANSION");
  assert.match(n64.hardware.find((item) => item.id === "hardware-64dd")?.summaryEs ?? "", /japonesa/i);
  assert.match(gba.hardware.find((item) => item.id === "hardware-gameboy-micro")?.summaryEs ?? "", /sólo acepta (?:juegos|software) GBA/i);
  assert.equal(gba.hardware.find((item) => item.id === "hardware-gameboy-player")?.kind, "PERIPHERAL");
  assert.equal(gameCube.hardware.find((item) => item.id === "hardware-panasonic-q")?.kind, "MULTIMEDIA_HYBRID");
  assert.equal(getPlatformHardwareGroup("gamecube", "hardware-wavebird"), "controllers");
});

test("protects DS, Wii, 3DS and Wii U revision and service boundaries", () => {
  const ds = getPlatformHistory("ds");
  const wii = getPlatformHistory("wii");
  const threeDs = getPlatformHistory("3ds");
  const wiiU = getPlatformHistory("wiiu");
  assert.ok(ds && wii && threeDs && wiiU);

  assert.match(ds.hardware.find((item) => item.id === "hardware-nintendo-dsi")?.summaryEs ?? "", /elimina la ranura GBA/i);
  assert.notEqual(
    ds.services?.find((service) => service.id === "service-dsi-shop")?.id,
    threeDs.services?.find((service) => service.id === "service-3ds-eshop")?.id,
  );
  assert.match(wii.compatibilityLinks?.[0]?.summaryEs ?? "", /RVL-001/);
  assert.match(JSON.stringify(wii.services), /No era suscripción|No es Virtual Console/i);
  assert.equal(threeDs.hardware.find((item) => item.id === "hardware-new-nintendo-3ds")?.kind, "MID_GENERATION_UPGRADE");
  assert.match(JSON.stringify(threeDs), /misma generación|no una generación nueva/i);
  assert.match(wiiU.hardware.find((item) => item.id === "hardware-wiiu-gamepad")?.summaryEs ?? "", /requiere una consola Wii U/i);
  assert.match(wiiU.compatibilityLinks?.[0]?.summaryEs ?? "", /no reproduce discos GameCube/i);
  assert.equal(wiiU.companies.find((item) => item.companySlug === "platinumgames")?.relationshipType, "STRATEGIC_THIRD_PARTY");
});

test("protects Switch model boundaries and Switch 2 live-generation facts", () => {
  const switchHistory = getPlatformHistory("switch");
  const switch2 = getPlatformHistory("switch2");
  assert.ok(switchHistory && switch2);

  assert.match(switchHistory.hardware.find((item) => item.id === "hardware-switch-lite")?.summaryEs ?? "", /sin salida de TV/i);
  assert.match(switchHistory.hardware.find((item) => item.id === "hardware-switch-oled")?.summaryEs ?? "", /sin salto generacional de rendimiento/i);
  for (const slug of ["game-freak", "hal-laboratory", "intelligent-systems"]) {
    assert.match(
      switchHistory.companies.find((item) => item.companySlug === slug)?.relationshipLabelEs ?? "",
      /independiente/i,
      slug,
    );
  }
  assert.equal(switchHistory.companies.find((item) => item.companySlug === "next-level-games")?.relationshipStart, "2021");

  assert.equal(switch2.generationStatus?.labelEs, "Generación en curso");
  assert.equal(switch2.generationStatus?.asOf, "2026-09-15");
  const display = switch2.architecture?.find((item) => item.id === "architecture-switch2-display");
  assert.ok(display?.features.includes("LCD, no OLED"));
  assert.ok(display?.features.includes("1920 × 1080"));
  assert.match(JSON.stringify(switch2.architecture), /procesador personalizado/i);
  assert.doesNotMatch(JSON.stringify(switch2), /T239|Drake|Orin/i);
  assert.match(switch2.compatibilityLinks?.[0]?.summaryEs ?? "", /algunos títulos.*no.*compatibles|no funcionar plenamente/i);
  assert.equal(switch2.hardware.find((item) => item.id === "hardware-joycon2")?.features.includes("Acoplamiento magnético"), true);
  assert.equal(switch2.services?.find((service) => service.id === "service-switch2-gamechat")?.kind, "SOCIAL_SERVICE");
  const roleByPerson = new Map(switch2.figures.map((figure) => [figure.personSlug, figure.roleLabelEs]));
  assert.match(roleByPerson.get("kouichi-kawamoto") ?? "", /Productor/);
  assert.match(roleByPerson.get("takuhiro-dohta") ?? "", /Director/);
  assert.match(roleByPerson.get("tetsuya-sasaki") ?? "", /Director técnico/);
  assert.doesNotMatch(JSON.stringify(switch2.hardware), /Zelda.*40/i);
});

test("publishes Nintendo corporate history, people and dated relationships", () => {
  const profile = buildCompanyProfileView("nintendo");
  assert.ok(profile);
  assert.match(profile.history ?? "", /1889/);
  assert.match(profile.history ?? "", /dos ramas paralelas/i);
  assert.match(profile.history ?? "", /no se presenta como subsidiaria propiedad al 100 %/i);
  assert.match(profile.history ?? "", /joint venture/i);

  const linkedPlatforms = new Set(profile.platformHistoryLinks.map((link) => link.platformSlug));
  nintendoPlatformSlugs.forEach((slug) => assert.ok(linkedPlatforms.has(slug), slug));
  for (const slug of ["hiroshi-yamauchi", "shuntaro-furukawa", "masayuki-uemura", "kouichi-kawamoto"]) {
    assert.ok(profile.people.some((person) => person.slug === slug), slug);
  }

  const achievementIds = new Set(profile.achievements.map((achievement) => achievement.id));
  company.achievements.forEach((achievement) => assert.ok(achievementIds.has(achievement.id), achievement.id));
  const sourceIds = new Set(company.sources.map((source) => source.id));
  company.achievements.forEach((achievement) => assert.ok(sourceIds.has(achievement.sourceId), achievement.id));

  for (const relationId of [
    "PHG-NIN-GC-RETRO-NINTENDO",
    "PHG-NIN-WII-MONOLITH",
    "PHG-NIN-SWITCH-NLG",
    "PHG-NIN-SWITCH-SRD",
    "PHG-NIN-SWITCH-SHIVER",
  ]) {
    assert.ok(getCompanyGenealogyRelations("nintendo").some((relation) => relation.id === relationId), relationId);
  }
});

test("reuses existing people and keeps doubts, future hardware and portraits private", () => {
  const created = new Set(people.profiles?.map((profile) => profile.slug));
  for (const slug of ["gunpei-yokoi", "satoru-iwata", "shigeru-miyamoto", "satoshi-tajiri"]) {
    assert.equal(created.has(slug), false, slug);
    assert.ok(getPublicPersonView(slug), slug);
  }
  assert.equal(people.profiles?.length, 30);
  people.profiles?.forEach((profile) => {
    assert.ok(getPublicPersonView(profile.slug), profile.slug);
    assert.equal(profile.portrait, null, profile.slug);
    profile.sourceIds.forEach((id) => assert.ok(getPersonPublicSource(id), id));
  });
  for (const relation of [
    ...(people.companyRelations ?? []),
    ...(people.positions ?? []),
    ...(people.relatedWorks ?? []),
    ...(people.historicalRelations ?? []),
  ]) {
    assert.ok(getPersonPublicSource(relation.sourceId), relation.sourceId);
  }

  const publicPeople = new Set(getPublicPersonSlugs());
  internal.peopleCandidates.forEach((candidate) => {
    assert.equal(publicPeople.has(candidate.personSlug), false, candidate.personSlug);
  });
  assert.ok(internal.companyCandidates.some((candidate) => candidate.status === "PROTECTED_OWNERSHIP_BOUNDARY"));
  assert.ok(internal.creditCandidates.some((candidate) => candidate.title.includes("Mario Kart World")));
  assert.equal(internal.hardwareCandidates[0]?.status, "ANNOUNCED_FUTURE_VARIANT");
  const fallbacks = new Set(internal.mediaReferences.map((item) => item.personSlug));
  people.profiles?.forEach((profile) => assert.ok(fallbacks.has(profile.slug), profile.slug));

  const loader = readFileSync("src/lib/person-public-research.ts", "utf8");
  assert.doesNotMatch(loader, /internal-candidates-nintendo\.json/);
});
