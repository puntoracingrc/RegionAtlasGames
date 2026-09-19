import assert from "node:assert/strict";
import test from "node:test";
import { editionPriceGame, loadCatalogPriceGames } from "./catalog-price-games";
import type { CatalogGame } from "./types";

test("deduplicates lookups, reuses current game and bounds parallel I/O", async () => {
  const current = { id: "es", estimatedPriceComplete: 70 } as CatalogGame;
  let active = 0;
  let peak = 0;
  const calls: string[] = [];
  const ids = ["es", ...Array.from({ length: 13 }, (_, index) => String(index)), "1"];
  const games = await loadCatalogPriceGames(ids, async id => {
    calls.push(id);
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--;
    return { id } as CatalogGame;
  }, [current]);
  assert.equal(peak, 4);
  assert.equal(calls.length, 13);
  assert.equal(games.es, current);
  assert.equal(editionPriceGame(["es"], games)?.estimatedPriceComplete, 70);
});

test("unlinked or missing region never borrows the page game's prices", async () => {
  const games = await loadCatalogPriceGames(["usa"], async () => ({ id: "es" } as CatalogGame), [{ id: "es" } as CatalogGame]);
  assert.equal(editionPriceGame(["usa"], games), undefined);
  assert.equal(editionPriceGame([], games), undefined);
});
