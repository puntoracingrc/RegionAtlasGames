import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { authorizeCatalogConnector, CatalogConnectorError, parseCatalogSubmission } from "./direct-catalog-connector";

const valid = {
  schemaVersion: 1,
  batchId: "catalog-20260920-example",
  taskId: "task-587",
  title: "Example [Collector's Edition]",
  platformSlug: "ps4",
  region: "PAL España",
  physicalVariant: "Collector's Edition",
  sources: [{ label: "Anuncio eBay", url: "https://www.ebay.es/itm/123" }],
};

test("normaliza una ficha comercial PAL España", () => {
  assert.deepEqual(parseCatalogSubmission(valid), valid);
});

test("rechaza campos adicionales y regiones fuera de esta fase", () => {
  assert.throws(() => parseCatalogSubmission({ ...valid, surprise: true }), CatalogConnectorError);
  assert.throws(() => parseCatalogSubmission({ ...valid, region: "USA" }), CatalogConnectorError);
});

test("rechaza fuentes no HTTPS o duplicadas", () => {
  assert.throws(() => parseCatalogSubmission({ ...valid, sources: [{ label: "x", url: "http://example.com" }] }), CatalogConnectorError);
  assert.throws(() => parseCatalogSubmission({ ...valid, sources: [valid.sources[0], valid.sources[0]] }), CatalogConnectorError);
});

test("la activación y el bearer son obligatorios", () => {
  const token = "a".repeat(40);
  const request = new Request("https://www.regionatlas.games/api/integrations/catalog", {
    headers: { authorization: `Bearer ${token}` },
  });
  const env = {
    CATALOG_CONNECTOR_ENABLED: "1",
    PRICE_CONNECTOR_TOKEN_SHA256: createHash("sha256").update(token).digest("hex"),
  };
  assert.doesNotThrow(() => authorizeCatalogConnector(request, env));
  assert.throws(() => authorizeCatalogConnector(request, { ...env, CATALOG_CONNECTOR_ENABLED: "0" }), CatalogConnectorError);
  assert.throws(() => authorizeCatalogConnector(new Request(request.url), env), CatalogConnectorError);
});
