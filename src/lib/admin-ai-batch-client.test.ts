import assert from "node:assert/strict";
import test from "node:test";
import {
  appendAdminAiBatchFailure,
  createAdminAiBatchReport,
  describeAdminAiBatchResponseError,
  mergeAdminAiBatchReports,
  replaceAdminAiBatchItem,
  type AdminAiBatchItem,
} from "./admin-ai-batch-client";

const previewItem: AdminAiBatchItem = {
  pcId: 10,
  catalogId: "ps4-example",
  title: "Example",
  platformSlug: "ps4",
  region: "PAL España",
  status: "dry-run",
  message: "Previsualización generada.",
  fieldsUpdated: ["description"],
  sources: ["PlayStation Store"],
  urls: ["https://example.com"],
  steamTags: [],
  descriptionPreview: "Descripción",
  seoPreview: "SEO",
};

test("acumula respuestas de una ficha sin perder el total del lote", () => {
  const batch = createAdminAiBatchReport(390, true);
  const single = {
    ...createAdminAiBatchReport(1, true),
    selected: 1,
    processed: 1,
    sourceCoverage: {
      steam: 0,
      official: 1,
      wikipedia: 0,
      existing: 0,
      other: 0,
    },
    fieldCoverage: { description: 1 },
    items: [previewItem],
  };

  const merged = mergeAdminAiBatchReports(batch, single);

  assert.equal(merged.scanned, 390);
  assert.equal(merged.selected, 1);
  assert.equal(merged.processed, 1);
  assert.equal(merged.sourceCoverage.official, 1);
  assert.equal(merged.fieldCoverage.description, 1);
  assert.deepEqual(merged.items, [previewItem]);
});

test("convierte un fallo de red individual en un resultado relanzable", () => {
  const report = appendAdminAiBatchFailure(
    createAdminAiBatchReport(10, true),
    {
      id: "catalog:ps4-example",
      pcId: 10,
      catalogId: "ps4-example",
      title: "Example",
      platformSlug: "ps4",
      region: "PAL España",
      status: "published",
      lastSeenAt: "",
    },
    "La ficha agotó el tiempo de procesamiento.",
  );

  assert.equal(report.selected, 1);
  assert.equal(report.errors, 1);
  assert.equal(report.items[0]?.status, "error");
  assert.match(report.items[0]?.message ?? "", /agotó el tiempo/);
});

test("reemplaza la ficha correcta usando su ID de catálogo", () => {
  const first = { ...previewItem, pcId: null, catalogId: "ps4-first" };
  const second = { ...previewItem, pcId: null, catalogId: "ps4-second", title: "Second" };
  const updatedSecond = { ...second, status: "processed" as const, message: "Guardada" };
  const report = { ...createAdminAiBatchReport(2, true), items: [first, second] };

  const updated = replaceAdminAiBatchItem(report, updatedSecond);

  assert.equal(updated.items[0]?.catalogId, "ps4-first");
  assert.equal(updated.items[1]?.status, "processed");
});

test("explica los timeouts del servidor sin llamarlos error de red", () => {
  assert.match(describeAdminAiBatchResponseError(504), /agotó el tiempo/);
  assert.equal(describeAdminAiBatchResponseError(500, "Fallo concreto"), "Fallo concreto");
});
