import assert from "node:assert/strict";
import test from "node:test";
import { buildCompanyProfileView } from "./company-profile";
import {
  getPublicCompanyAchievements,
  getPublicCompanyResearchSources,
} from "./company-public-research";

test("publishes the current SNK company separately from its historical predecessor", () => {
  const current = buildCompanyProfileView("snk");
  const original = buildCompanyProfileView("snk-original");

  assert.ok(current);
  assert.ok(original);
  assert.equal(current.foundedYear, 2001);
  assert.equal(original.editorialOnly, true);
  assert.equal(original.status, "defunct");
  assert.match(current.history ?? "", /otra persona jurídica/);
  assert.match(current.history ?? "", /sucedió.*propiedad intelectual/i);
  assert.doesNotMatch(current.history ?? "", /misma persona jurídica/i);
});

test("connects SNK corporate history to primary sources and dated milestones", () => {
  const achievements = getPublicCompanyAchievements("snk");
  const sources = getPublicCompanyResearchSources("snk");
  const sourceIds = new Set(sources.map((source) => source.id));

  assert.equal(achievements.length, 8);
  assert.deepEqual(
    achievements.map((achievement) => achievement.yearLabel),
    ["1978", "Abr 1986", "1990", "2001", "Jul 2003", "2015", "2016", "2022"],
  );
  assert.ok(sources.every((source) => source.verifiedPrimary));
  achievements.forEach((achievement) => assert.ok(sourceIds.has(achievement.sourceId)));
});
