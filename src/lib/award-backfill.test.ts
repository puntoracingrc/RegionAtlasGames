import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { getCatalogWorkKey } from "./catalog-work";
import { createAwardQueries } from "./award-public-research";
import type { AwardPublicData } from "./award-research-types";

const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const awards = read("data/research/award-study/public.json") as AwardPublicData;
const query = createAwardQueries(awards);

test("reviewed batch is deterministic and refuses historical result loss", () => {
  execFileSync("node_modules/.bin/tsx", ["scripts/prepare-awards-v1.ts", "--check"]);
  const compiler = readFileSync("scripts/prepare-awards-v1.ts", "utf8");
  assert.match(compiler, /Refusing to remove historical result/);
  assert.match(compiler, /assert\.deepEqual\(next, old/);
});

test("all initial organizations have recent and historical verified winners", () => {
  assert.equal(awards.series.length, 7);
  for (const series of awards.series) {
    const view = query.getAwardSeriesView(series.slug)!;
    for (const year of [2021,2022,2023,2024,2025]) {
      assert.ok(view.results.some(r => r.resultType === "winner" && r.editionId === `${series.slug}:${year}` && view.categories.some(c => c.id === r.categoryId && c.categoryType === "top_game")), `${series.slug} ${year}`);
    }
    assert.ok(view.editions.some(e => e.editionYear < 2021));
    assert.ok(series.selectionModel);
  }
});

test("Elden Ring variants share one work and Sunbreak never becomes Rise", () => {
  assert.equal(getCatalogWorkKey("ps4-elden-ring"), getCatalogWorkKey("ps5-usa-elden-ring"));
  const ring = query.getAwardsForWorkKey(getCatalogWorkKey("ps4-elden-ring"));
  assert.equal(ring.filter(r => r.seriesSlug === "the-game-awards").length, 1);
  const expansion = awards.results.find(r => r.recipients.some(p => p.displayName === "Monster Hunter Rise: Sunbreak"))!;
  assert.ok(expansion.recipients.every(p => p.type === "game" && p.workKey === null));
  assert.ok(!query.getAwardsForWorkKey(getCatalogWorkKey("switch-monster-hunter-rise")).some(r => r.id === expansion.id));
});

test("personal context and legacy links preserve exact identities without duplication", () => {
  const people = read("data/research/person-study/public.json");
  for (const link of awards.personWorkLinks) {
    const credit = people.exactCredits.find((c: {id:string}) => c.id === link.personWorkId);
    assert.equal(credit.relationshipPrecision, "EXACT_EDITORIAL_CREDIT");
    assert.equal(link.role, credit.role);
  }
  assert.equal(new Set(awards.legacyLinks.map(l => l.legacyAwardId)).size, awards.legacyLinks.length);
  assert.ok(query.getDirectAwardsForPerson("hidetaka-miyazaki").every(r => r.recipients.every(p => p.type === "person")));
  assert.ok(query.getWorkAwardsForPerson("hideo-kojima").some(w => w.personWorkIds.includes("PWORK-00071")));
  for (const slug of ["sam-lake","todd-howard","swen-vincke","guillaume-broche"]) assert.equal(query.getDirectAwardsForPerson(slug).length, 0);
});

test("every old personal recognition has an explicit disposition", () => {
  const legacy = read("data/research/person-study/awards.json").records;
  const links = read("data/research/award-study/research.json").legacyLinks;
  assert.deepEqual(links.map((l: {legacyAwardId:string}) => l.legacyAwardId).sort(), legacy.map((l: {award_id:string}) => l.award_id).sort());
});

test("future editions have no invented winners and finalists are not wins", () => {
  for (const e of query.getUpcomingAwardEditions()) assert.equal(query.getAwardEditionView(e.seriesSlug,e.editionYear)!.results.length, 0);
  const bg = query.getAwardsForWorkKey(getCatalogWorkKey("ps5-usa-baldur-s-gate-iii-deluxe-edition"));
  assert.ok(query.getAwardStats(bg).nominations > 0);
  const used = new Set([...awards.series,...awards.editions,...awards.categories,...awards.results,...awards.workLinks,...awards.personWorkLinks,...awards.companyWorkLinks].flatMap(r => r.sourceIds));
  assert.deepEqual([...used].sort(), awards.sources.map(s => s.id).sort());
});
