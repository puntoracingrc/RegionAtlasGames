import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import companyData from "../../data/research/platform-history/company-sega-public.json";
import internalSegaData from "../../data/research/platform-history/internal-candidates-sega.json";
import segaPeopleData from "../../data/research/platform-history/people-sega-public.json";
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
import type { PlatformHistory } from "./platform-history-types";
import type { PersonPublicOverlayData } from "./person-research-types";

const segaPlatformSlugs = [
  "mastersystem",
  "megadrive",
  "gamegear",
  "saturn",
  "dreamcast",
] as const;
const people = segaPeopleData as unknown as PersonPublicOverlayData;
const company = companyData as {
  profiles: { slug: string }[];
  achievements: { id: string; sourceId: string }[];
  sources: { id: string }[];
};
const internal = internalSegaData as {
  peopleCandidates: { personSlug: string; status: string }[];
  companyCandidates: { companySlug: string; status: string }[];
  creditCandidates: { title: string; status: string }[];
  mediaReferences: { personSlug: string; status: string }[];
};

function assertHistorySourcesResolve(history: PlatformHistory): void {
  const sourceIds = new Set(history.sources.map((source) => source.id));
  const assertSources = (ids: string[]) => {
    ids.forEach((id) => assert.ok(sourceIds.has(id), `${history.platformSlug}:${id}`));
  };

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

test("publishes five connected SEGA histories without inventing arcade catalog platforms", () => {
  const histories = segaPlatformSlugs.map((slug) => getPlatformHistory(slug));
  histories.forEach((history, index) => {
    assert.ok(history, segaPlatformSlugs[index]);
    assert.ok(history.summaryParagraphsEs.length >= 3, history.platformSlug);
    assert.ok(history.figures.length >= 4, history.platformSlug);
    assert.ok(history.companies.length >= 4, history.platformSlug);
    assert.ok(history.hardware.length >= 5, history.platformSlug);
    assert.ok((history.editorialSections?.length ?? 0) >= 2, history.platformSlug);
    assertHistorySourcesResolve(history);
  });

  for (const slug of ["system16", "model1", "model2", "model3", "stv", "naomi", "naomi2"]) {
    assert.equal(getPlatformHistory(slug), undefined, slug);
  }
});

test("resolves every SEGA figure and company through public internal links", () => {
  const publicPeople = new Set(getPublicPersonSlugs());
  for (const platformSlug of segaPlatformSlugs) {
    const history = getPlatformHistory(platformSlug);
    assert.ok(history);
    history.figures.forEach((figure) => {
      assert.ok(publicPeople.has(figure.personSlug), figure.personSlug);
      assert.ok(getPublicPersonView(figure.personSlug), figure.personSlug);
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

test("keeps the early domestic systems and Mega Drive expansions distinct", () => {
  const early = getPlatformHistory("mastersystem");
  const megaDrive = getPlatformHistory("megadrive");
  assert.ok(early);
  assert.ok(megaDrive);

  const earlyHardware = new Map(early.hardware.map((item) => [item.id, item]));
  assert.equal(earlyHardware.get("hardware-sc-3000")?.kind, "HOME_COMPUTER");
  assert.equal(earlyHardware.get("hardware-sg-1000-ii")?.kind, "REDESIGN");
  assert.equal(earlyHardware.get("hardware-sega-mark-iii")?.kind, "SUCCESSOR_PLATFORM");
  assert.equal(earlyHardware.get("hardware-master-system-international")?.kind, "REGIONAL_MODEL");

  const megaHardware = new Map(megaDrive.hardware.map((item) => [item.id, item]));
  assert.equal(megaHardware.get("hardware-genesis-north-america")?.kind, "REGIONAL_MODEL");
  assert.equal(megaHardware.get("hardware-mega-cd")?.kind, "HARDWARE_EXPANSION");
  assert.equal(megaHardware.get("hardware-sega-32x")?.kind, "HARDWARE_EXPANSION");
  assert.equal(getPlatformHistory("megacd"), undefined);
  assert.equal(getPlatformHistory("sega32x"), undefined);
  assert.ok(getPlatformHistory("saturn"));
  assert.equal(getPlatformHardwareGroup("megadrive", "hardware-wondermega"), "models");
});

test("models Game Gear compatibility as an adapter-mediated link", () => {
  const history = getPlatformHistory("gamegear");
  assert.ok(history);
  const converter = history.hardware.find((item) => item.id === "hardware-master-gear-converter");
  const micro = history.hardware.find((item) => item.id === "hardware-gamegear-micro");
  const link = history.compatibilityLinks?.find((item) => item.id === "compat-gamegear-mastersystem");
  assert.equal(converter?.kind, "PERIPHERAL");
  assert.equal(micro?.kind, "COMMEMORATIVE_HARDWARE");
  assert.equal(link?.targetPlatformSlug, "mastersystem");
  assert.match(link?.summaryEs ?? "", /adaptador/i);
  assert.match(link?.summaryEs ?? "", /no existe compatibilidad física directa/i);
});

test("protects Saturn and Dreamcast boundaries", () => {
  const saturn = getPlatformHistory("saturn");
  const dreamcast = getPlatformHistory("dreamcast");
  assert.ok(saturn);
  assert.ok(dreamcast);

  const saturnText = JSON.stringify(saturn);
  const releasedSaturnGames = saturn.gameGroups?.flatMap((group) => group.games) ?? [];
  assert.match(saturnText, /ST-V/);
  assert.match(saturnText, /No Saturn retail/);
  assert.match(saturnText, /Model 2 arcade no es Saturn Model 2/);
  assert.ok(saturn.editorialSections?.some((section) => section.cards.some((card) => card.id === "sonic-xtreme")));
  assert.equal(releasedSaturnGames.some((game) => game.title === "Sonic X-treme"), false);
  const travellersTales = saturn.companies.find((company) => company.companySlug === "travellers-tales");
  const sonicTeam = saturn.companies.find((company) => company.companySlug === "sonic-team");
  assert.ok(travellersTales?.relatedWorks.includes("Sonic R"));
  assert.equal(sonicTeam?.relatedWorks.includes("Sonic R"), false);

  const dreamcastText = JSON.stringify(dreamcast);
  assert.match(dreamcastText, /NAOMI y Dreamcast: cercanas, no idénticas/);
  assert.match(dreamcastText, /Módem integrado/);
  assert.match(dreamcastText, /termina el hardware doméstico, no SEGA/i);
});

test("publishes backed SEGA people, reuses existing profiles and retains doubts internally", () => {
  assert.equal(people.profiles?.length, 13);
  assert.equal(people.exactCredits?.length, 0);
  assert.equal(people.historicalRelations?.length, 33);

  const reused = ["yu-suzuki", "rieko-kodama", "peter-moore", "mark-cerny"];
  const created = new Set(people.profiles?.map((profile) => profile.slug));
  reused.forEach((slug) => {
    assert.equal(created.has(slug), false, slug);
    assert.ok(getPublicPersonView(slug), slug);
  });
  people.profiles?.forEach((profile) => assert.ok(getPublicPersonView(profile.slug), profile.slug));

  const cernyRelation = people.companyRelations?.find(
    (relation) => relation.personSlug === "mark-cerny" && relation.companySlug === "sega-technical-institute-sti",
  );
  assert.equal(cernyRelation?.start, "1988");
  assert.equal(cernyRelation?.end, "1992");

  const referenced = new Set<string>();
  people.profiles?.forEach((profile) => profile.sourceIds.forEach((id) => referenced.add(id)));
  for (const rows of [
    people.companyRelations ?? [],
    people.positions ?? [],
    people.relatedWorks ?? [],
    people.historicalRelations ?? [],
  ]) {
    rows.forEach((row) => referenced.add(row.sourceId));
  }
  referenced.forEach((id) => assert.ok(getPersonPublicSource(id), id));

  const publicPeople = new Set(getPublicPersonSlugs());
  internal.peopleCandidates.forEach((candidate) => {
    assert.equal(publicPeople.has(candidate.personSlug), false, candidate.personSlug);
  });
  assert.ok(internal.companyCandidates.some((candidate) => candidate.companySlug === "relic-entertainment"));
  assert.ok(internal.creditCandidates.some((candidate) => candidate.status === "CANCELLED_NON_RELEASE"));
  const fallback = new Set(internal.mediaReferences.map((item) => item.personSlug));
  people.profiles?.forEach((profile) => {
    if (!profile.portrait) assert.ok(fallback.has(profile.slug), profile.slug);
  });

  const loader = readFileSync("src/lib/person-public-research.ts", "utf8");
  assert.doesNotMatch(loader, /internal-candidates-sega\.json/);
});

test("expands the SEGA company page with corporate history and five platform links", () => {
  const profile = buildCompanyProfileView("sega");
  assert.ok(profile);
  assert.match(profile.history ?? "", /Rosen Enterprises/);
  assert.match(profile.history ?? "", /no fue el cierre de la empresa/i);
  const achievementIds = new Set(profile.achievements.map((achievement) => achievement.id));
  company.achievements.forEach((achievement) => assert.ok(achievementIds.has(achievement.id), achievement.id));
  const linkedPlatforms = new Set(profile.platformHistoryLinks.map((link) => link.platformSlug));
  segaPlatformSlugs.forEach((slug) => assert.ok(linkedPlatforms.has(slug), slug));
  for (const slug of ["hideki-sato", "rieko-kodama"]) {
    assert.ok(profile.people.some((person) => person.slug === slug), slug);
  }
  const sti = buildCompanyProfileView("sega-technical-institute-sti");
  assert.ok(sti?.people.some((person) => person.slug === "mark-cerny"));

  const sourceIds = new Set([
    ...company.sources.map((source) => source.id),
    "source-2ae44cffb0876718",
  ]);
  company.achievements.forEach((achievement) => assert.ok(sourceIds.has(achievement.sourceId), achievement.id));
});
