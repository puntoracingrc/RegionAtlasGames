import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { platforms } from "./catalog";
import {
  DEFAULT_PERSON_EXPLORER_FILTERS,
  filterPersonCards,
  parsePersonExplorerFilters,
  serializePersonExplorerFilters,
} from "./person-explorer-filters";
import {
  classifyPersonExpertiseTerms,
  getAvailablePersonExpertiseFilters,
} from "./person-expertise";
import { getPlatformHistoryData } from "./platform-history";
import { getPlatformHistoryPresentation } from "./platform-history-presentation";
import { personMatchesPlatformFilters } from "./person-platform-filter-match";
import { getPersonPlatformFilterGroups } from "./person-platform-filters";
import { getPersonCards } from "./person-public-research";

const groups = getPersonPlatformFilterGroups();
const people = getPersonCards();
const expertiseOptions = getAvailablePersonExpertiseFilters(people);
const peopleBySlug = new Map(people.map((person) => [person.slug, person]));
const platformSlugs = groups.flatMap((group) =>
  group.platforms.map((platform) => platform.slug),
);

test("offers every documented brand and platform even without associated people", () => {
  assert.deepEqual(
    groups.map((group) => [group.brand, group.label]),
    [
      ["sony", "PlayStation"],
      ["nintendo", "Nintendo"],
      ["microsoft", "Xbox"],
      ["sega", "SEGA"],
      ["snk", "Neo Geo"],
    ],
  );
  assert.equal(new Set(platformSlugs).size, platformSlugs.length);

  for (const platform of platforms) {
    assert.ok(platformSlugs.includes(platform.slug), platform.slug);
  }
  for (const history of getPlatformHistoryData().platforms) {
    if (!getPlatformHistoryPresentation(history)) continue;
    assert.ok(platformSlugs.includes(history.platformSlug), history.platformSlug);
  }

  assert.ok(platformSlugs.includes("sega32x"));
  assert.ok(platformSlugs.includes("neogeo-aes-plus"));
  assert.ok(platformSlugs.includes("gameandwatch"));
  assert.ok(platformSlugs.includes("virtualboy"));
  assert.ok(platformSlugs.includes("hyper-neogeo-64"));
});

test("derives platform associations from every documented platform figure", () => {
  for (const history of getPlatformHistoryData().platforms) {
    for (const figure of history.figures) {
      const person = peopleBySlug.get(figure.personSlug);
      assert.ok(person, figure.personSlug);
      assert.ok(person.platformSlugs.includes(history.platformSlug), `${figure.personSlug}:${history.platformSlug}`);
    }
  }
});

test("keeps every person platform association inside a visible filter option", () => {
  for (const person of people) {
    for (const platformSlug of person.platformSlugs) {
      assert.ok(platformSlugs.includes(platformSlug), `${person.slug}:${platformSlug}`);
    }
  }
});

test("combines expertise, brand and platform filters without widening results", () => {
  const directors = people.filter((person) => person.expertise.includes("direction"));
  const playStationDirectors = directors.filter((person) =>
    personMatchesPlatformFilters(person, "sony", "all", groups),
  );
  const ps2Directors = playStationDirectors.filter((person) =>
    personMatchesPlatformFilters(person, "sony", "ps2", groups),
  );

  assert.ok(ps2Directors.length > 0);
  assert.ok(ps2Directors.length <= playStationDirectors.length);
  assert.ok(playStationDirectors.length <= directors.length);
  assert.ok(ps2Directors.every((person) => person.expertise.includes("direction")));
  assert.ok(ps2Directors.every((person) => person.platformSlugs.includes("ps2")));
});

test("resets platform scope logically when the selected brand changes", () => {
  const kawamoto = peopleBySlug.get("kouichi-kawamoto");
  assert.ok(kawamoto);
  assert.equal(personMatchesPlatformFilters(kawamoto, "nintendo", "all", groups), true);
  assert.equal(personMatchesPlatformFilters(kawamoto, "nintendo", "switch2", groups), true);
  assert.equal(personMatchesPlatformFilters(kawamoto, "sony", "all", groups), false);
});

test("classifies the expanded expertise taxonomy deterministically", () => {
  assert.deepEqual(classifyPersonExpertiseTerms(["Marketing y estrategia comercial"]), [
    "business_marketing",
  ]);
  assert.deepEqual(classifyPersonExpertiseTerms(["Dirección creativa y guion"]), [
    "direction",
    "writing_narrative",
  ]);
  assert.deepEqual(classifyPersonExpertiseTerms(["Neurocientífico y colaborador cultural"]), [
    "research",
  ]);
  const hardware = classifyPersonExpertiseTerms(["Ingeniero y diseñador de hardware"]);
  assert.ok(hardware.includes("hardware"));
  assert.ok(hardware.includes("design"));
  assert.ok(!hardware.includes("programming"));
  assert.deepEqual(classifyPersonExpertiseTerms(["Cargo documental aún no mapeado"]), [
    "other",
  ]);
});

test("derives visible expertise filters and counts from every published person", () => {
  assert.ok(people.length >= 130, `expected the current people corpus, found ${people.length}`);
  assert.ok(people.every((person) => person.expertise.length > 0));

  const options = new Map(expertiseOptions.map((option) => [option.value, option]));
  for (const [value, label] of [
    ["business_marketing", "Negocio y marketing"],
    ["writing_narrative", "Escritura y narrativa"],
    ["research", "Investigación"],
    ["hardware", "Hardware"],
  ] as const) {
    const option = options.get(value);
    assert.ok(option, value);
    assert.equal(option.label, label);
    assert.ok(option.count > 0, value);
  }

  for (const person of people) {
    for (const expertise of person.expertise) {
      assert.ok(options.has(expertise), `${person.slug}:${expertise}`);
    }
  }
});

test("combines expertise, brand and platform through the shared UI filter pipeline", () => {
  const filtered = filterPersonCards(
    people,
    {
      ...DEFAULT_PERSON_EXPLORER_FILTERS,
      expertise: "hardware",
      brand: "nintendo",
      platformSlug: "switch2",
    },
    groups,
  );

  assert.ok(filtered.length > 0);
  assert.ok(filtered.every((person) => person.expertise.includes("hardware")));
  assert.ok(filtered.every((person) => person.platformSlugs.includes("switch2")));
});

test("round-trips valid filter state in the URL and rejects incompatible values", () => {
  const params = new URLSearchParams(
    "utm_source=qa&q=chip&especialidad=hardware&marca=nintendo&plataforma=switch2&orden=nacimiento",
  );
  const parsed = parsePersonExplorerFilters(params, expertiseOptions, groups);
  assert.deepEqual(parsed, {
    query: "chip",
    expertise: "hardware",
    brand: "nintendo",
    platformSlug: "switch2",
    sort: "birth",
  });

  const serialized = serializePersonExplorerFilters(params, parsed);
  assert.equal(serialized.get("utm_source"), "qa");
  assert.deepEqual(
    parsePersonExplorerFilters(serialized, expertiseOptions, groups),
    parsed,
  );

  const invalid = parsePersonExplorerFilters(
    new URLSearchParams("especialidad=desconocida&marca=sony&plataforma=switch2"),
    expertiseOptions,
    groups,
  );
  assert.equal(invalid.expertise, "all");
  assert.equal(invalid.brand, "sony");
  assert.equal(invalid.platformSlug, "all");
});

test("keeps the interactive filter UI accessible and URL-backed", () => {
  const component = readFileSync("src/components/person-explorer.tsx", "utf8");
  const page = readFileSync("src/app/persona/page.tsx", "utf8");
  assert.match(component, /aria-pressed=/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /window\.history\.replaceState/);
  assert.match(component, /\.\.\.expertiseOptions/);
  assert.match(page, /getAvailablePersonExpertiseFilters\(people\)/);
  assert.match(page, /<Suspense/);
});
