import assert from "node:assert/strict";
import test from "node:test";
import markets from "../../data/ps1-region-markets.json";
import { filterCatalogGames } from "@/lib/catalog-filters";
import type { CatalogListGame } from "@/lib/types";
import {
  compactPlatformRegions,
  groupRegionOptions,
  isRegionSelectionAvailable,
  regionNavigationGroup,
} from "@/lib/region-navigation";

const families = ["PAL", "NTSC-U/C", "NTSC-J"].map((family) => `${family} · Mercado por determinar`);
const allMarkets = Object.values(markets.markets).map((market) => market.label);
const ps1Labels = [...allMarkets, ...families];
const games = ps1Labels.map((region, index) => ({
  id: `edition-${index}`, title: `Edition ${index}`, region, platformSlug: "ps1",
})) as CatalogListGame[];

function filter(region: string, list = games) {
  return filterCatalogGames(list, {
    region, q: "", platform: "all", sort: "title-asc", priceFilter: "all",
  }).items;
}

test("group browsing partitions every PS1 market once, with exact counts", () => {
  const groups = groupRegionOptions(ps1Labels.map((label) => ({ value: label, label, count: 1 })));
  assert.equal(groups.reduce((sum, group) => sum + (group.count ?? 0), 0), games.length);
  const groupedIds = groups.flatMap((group) => {
    const result = filter(group.value);
    assert.equal(result.length, group.count);
    assert.equal(isRegionSelectionAvailable(group.value, group.options), true);
    return result.map((game) => game.id);
  });
  assert.equal(new Set(groupedIds).size, games.length);
  assert.equal(groupedIds.length, games.length);
});

test("Europe aggregate and PAL Europa exact filter keep different scopes", () => {
  assert.deepEqual(filter("PAL Europa").map((game) => game.region), ["PAL Europa"]);
  const europe = filter("region-group:europe").map((game) => game.region);
  for (const label of ["PAL España", "PAL Europa", "PAL Francia", "PAL Alemania"]) assert.ok(europe.includes(label));
  for (const label of ["PAL Australia", "PAL Europa / Australia", ...families]) assert.ok(!europe.includes(label));
});

test("multi-market editions and unidentified market families keep their identity", () => {
  assert.equal(regionNavigationGroup("NTSC USA / Canadá"), "america");
  assert.equal(regionNavigationGroup("NTSC-J Japón / Asia"), "asia");
  assert.equal(regionNavigationGroup("PAL Europa / Australia"), "other");
  assert.deepEqual(filter("region-group:pending").map((game) => game.region).sort(), [...families].sort());
  for (const label of ps1Labels) assert.deepEqual(filter(label).map((game) => game.region), [label]);
  assert.deepEqual(filter("region-group:invalid"), []);
  assert.equal(isRegionSelectionAvailable("region-group:invalid", []), false);
});

test("platform card preview prioritizes ES EU US JP and counts hidden markets without question marks", () => {
  const reversed = [...ps1Labels].reverse();
  const original = [...reversed];
  const preview = compactPlatformRegions([...reversed, "PAL España"]);
  assert.deepEqual(preview.visible, ["PAL España", "PAL Europa", "NTSC USA", "NTSC-J Japón"]);
  assert.equal(preview.remaining, ps1Labels.length - 4);
  assert.deepEqual(reversed, original);
  assert.deepEqual(compactPlatformRegions(families), { visible: [], remaining: 3 });
  assert.deepEqual(compactPlatformRegions([]), { visible: [], remaining: 0 });
  assert.deepEqual(compactPlatformRegions(["Occidental", "Japonesa"]).visible, ["Occidental", "Japonesa"]);
});

test("Neo Geo public aliases remain usable and do not turn Western into Europe", () => {
  const neo = ["PAL Europa", "USA", "Japón"].map((region, index) => ({
    id: `neo-${index}`, title: `Neo ${index}`, region, platformSlug: "neogeopocket",
  })) as CatalogListGame[];
  assert.equal(filter("Europea", neo).length, 1);
  assert.equal(filter("region-group:europe", neo).length, 1);
  assert.equal(filter("Japonesa", neo).length, 1);
  assert.equal(regionNavigationGroup("Occidental"), "other");
  assert.equal(regionNavigationGroup("Internacional"), "other");
});
