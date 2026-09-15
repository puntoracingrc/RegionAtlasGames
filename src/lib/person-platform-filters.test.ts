import assert from "node:assert/strict";
import test from "node:test";
import { platforms } from "./catalog";
import { getPlatformHistoryData } from "./platform-history";
import { getPlatformHistoryPresentation } from "./platform-history-presentation";
import { personMatchesPlatformFilters } from "./person-platform-filter-match";
import { getPersonPlatformFilterGroups } from "./person-platform-filters";
import { getPersonCards } from "./person-public-research";

const groups = getPersonPlatformFilterGroups();
const people = getPersonCards();
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
