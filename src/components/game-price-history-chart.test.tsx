import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GamePriceHistoryChart } from "./game-price-history-chart";
import { PhysicalEditionPriceSwitcher, type PhysicalEditionPriceOption } from "./physical-edition-price-switcher";

test("chart identifies exact edition and states, uses published prices and exposes values as text", () => {
  const html = renderToStaticMarkup(<GamePriceHistoryChart catalogId="es" editionLabel="PAL España · Estándar" allowedBuckets={["complete", "sealed"]} history={[
    { at: "2026-08-27", complete: 75 }, { at: "2026-08-31", complete: 65 }, { at: "2026-09-19", complete: 70 },
  ]} />);
  assert.match(html, /PAL España · Estándar/);
  assert.match(html, /sin transporte/);
  assert.match(html, /Completo: 70/);
  assert.match(html, /Precintado: sin historial/);
  assert.equal((html.match(/<circle /g) ?? []).length, 3);
  assert.doesNotMatch(html, /Medias ponderadas/);
});

test("pending regions are explicit and do not display a fake zero curve", () => {
  const html = renderToStaticMarkup(<GamePriceHistoryChart catalogId="jp" editionLabel="Japón · Limited" history={[]} />);
  assert.match(html, /Sin historial/);
  assert.doesNotMatch(html, /<svg/);
});

test("initial selected edition owns the only rendered history, including single-edition pages", () => {
  const options: PhysicalEditionPriceOption[] = ["es", "us"].map(id => ({
    id, label: id, broadRegion: id, broadRegionLabel: id, regions: [], content: <p>{id} hero</p>, history: <p>{id} history</p>,
  }));
  const html = renderToStaticMarkup(<PhysicalEditionPriceSwitcher options={options} initialEditionId="us" />);
  assert.match(html, /us history/);
  assert.doesNotMatch(html, /es history/);
  const single = renderToStaticMarkup(<PhysicalEditionPriceSwitcher options={[options[0]]} />);
  assert.match(single, /es hero/);
  assert.match(single, /es history/);
});
