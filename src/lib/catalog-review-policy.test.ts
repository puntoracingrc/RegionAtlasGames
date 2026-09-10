import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { catalogReviewCounts, isGroupedCatalogName, isPendingCatalogGame, ps1CatalogReviewGroup } from "./catalog-review-policy";
import { filterCatalogGames, type CatalogFilterState } from "./catalog-filters";
import { getCatalogGame, publicListedCatalog } from "./catalog";
import { catalogGamePath, resolveCatalogGameParam } from "./catalog-url";
import { toCatalogListGame } from "./catalog-list-game";
import { toCatalogCardGame } from "./catalog-card-game";
import { relatedPs1Editions } from "./ps1-catalog";
import { getPs1VariantReview } from "./ps1-variant-review";
import type { CatalogListGame } from "./types";

const ps1 = publicListedCatalog.filter((game) => game.platformSlug === "ps1");
const listGames = ps1.map((game) => ({ ...game, displayPlatform: "PS1", displayYear: null, isGrail: false, isTopSegment: false })) as CatalogListGame[];
const defaults: CatalogFilterState = { q: "", region: "all", platform: "all", sort: "title-asc", priceFilter: "all" };

test("default PS1 browsing separates documented editions, pending records and grouped names", () => {
  assert.deepEqual(catalogReviewCounts(ps1), { documented: 8123, pending: 2304, groupedNames: 7, variants: { platinum: 161, "greatest-hits": 169, "long-box": 93, other: 1881 } });
  const result = filterCatalogGames(listGames, defaults);
  assert.equal(result.total, 8123);
  assert(result.items.every((game) => !isPendingCatalogGame(game)));
  assert.equal(result.reviewCounts.pending, 2304);
  const included = filterCatalogGames(listGames, { ...defaults, includePending: true });
  assert.equal(included.total, 10427);
  assert(!included.items.some(isGroupedCatalogName));
});

test("pending region and packaging filters use the same opt-in boundary and counts", () => {
  const pending = { ...defaults, region: "region-group:pending" };
  assert.equal(filterCatalogGames(listGames, pending).total, 0);
  assert.equal(filterCatalogGames(listGames, { ...pending, includePending: true }).total, 2304);
  for (const [kind, count] of [["platinum", 161], ["greatest-hits", 169], ["long-box", 93]] as const) {
    const result = filterCatalogGames(listGames, { ...defaults, includePending: true, pendingEdition: kind });
    assert.equal(result.total, count);
    assert(result.items.every(isPendingCatalogGame));
    assert.equal(result.reviewCounts.pending, 2304);
  }
  const spanish = filterCatalogGames(listGames, { ...defaults, region: "PAL España" });
  assert(spanish.items.length > 0);
  assert.equal(spanish.reviewCounts.pending, 0);
});

test("all 22 reviewed records retain their canonical URLs and physical uncertainty", () => {
  const groups = JSON.parse(readFileSync("data/ps1-catalog-curation.json", "utf8")).groups;
  assert.equal(groups.length, 11);
  const ids = groups.flatMap((group: { catalogIds: string[] }) => group.catalogIds);
  assert.equal(new Set(ids).size, 22);
  for (const id of ids) {
    const game = getCatalogGame(id)!;
    assert(game);
    assert.equal(resolveCatalogGameParam(catalogGamePath(game).split("/").at(-1)!)?.id, id);
    assert.equal(game.regionalStatus, "review");
    assert.equal(game.coverUrl, null);
  }
  for (const id of ["ps1-actua-pool", "ps1-usa-1xtreme", "ps1-usa-lunar-silver-star-story-complete-4-disc", "ps1-usa-resident-evil-3-nemesis-2-disc"]) {
    assert.equal(ps1CatalogReviewGroup(id)?.decision, "keep_separate");
    assert(!isGroupedCatalogName({ id }));
  }
});

test("searching an alternative spelling retrieves its primary pending record", () => {
  const primary = toCatalogListGame(getCatalogGame("ps1-starfighter-3000")!);
  const result = filterCatalogGames([primary], { ...defaults, q: "star fighter 3000", includePending: true });
  assert.equal(result.total, 1);
  assert.equal(toCatalogCardGame(primary).regionalStatus, "review");
});

test("only documented work relationships provide related edition cards", () => {
  assert.equal(ps1.filter((game) => isPendingCatalogGame(game) && relatedPs1Editions(game).length > 0).length, 391);
  const alundra = getCatalogGame("ps1-adventures-of-alundra")!;
  const related = relatedPs1Editions(alundra);
  assert(related.some((game) => game.id === "ps1-es-sles-01258" && game.coverUrl));
  assert(related.every((game) => game.regionalStatus === "resolved" && game.workId === alundra.workId));
  assert.deepEqual(relatedPs1Editions(getCatalogGame("ps1-007-racing-platinum")!), []);
});

test("all 423 variants have a review and gallery candidates cannot become confirmed covers", () => {
  const data = JSON.parse(readFileSync("data/ps1-variant-review.json", "utf8"));
  assert.equal(Object.keys(data.entries).length, 423);
  for (const id of Object.keys(data.entries)) {
    const review = getPs1VariantReview(id)!;
    assert.equal(review.physicalVariantResolved, false);
    assert.equal(getCatalogGame(id)?.coverUrl, null);
    for (const asset of review.references) {
      assert.equal(asset.assignmentVerified, false);
      assert.equal(asset.physicalPairingVerified, false);
      const label = `${asset.label} ${asset.group}`.toLowerCase().replaceAll("-", " ");
      assert(label.includes(review.kind.replaceAll("-", " ")));
    }
  }
  const bond = getPs1VariantReview("ps1-007-the-world-is-not-enough-platinum")!;
  assert(bond.references.some((asset) => asset.stored && /platinum-contraportada/.test(asset.url ?? "")));
  assert.equal(getPs1VariantReview("ps1-actua-soccer-platinum")?.references.length, 0);
  assert.equal(getPs1VariantReview("ps1-actua-soccer-platinum")?.status, "packaging_source_needed");
});
