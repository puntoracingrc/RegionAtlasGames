import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const artifactPath = join(import.meta.dirname, "before.json");
const before = JSON.parse(readFileSync(artifactPath, "utf8"));
const queries = [
  { key: "hack", url: "https://www.regionatlas.games/api/catalog/platform/ps2?q=hack&includePending=1&page=1" },
  { key: "summer", url: "https://www.regionatlas.games/api/catalog/platform/ps2?q=_summer&includePending=1&page=1" },
];

const liveSnapshots = {};
for (const query of queries) {
  const response = await fetch(query.url, { signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`${query.key}: HTTP ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body.items) || body.total > body.items.length) {
    throw new Error(`${query.key}: paginated or invalid result, refused to mark complete`);
  }
  const items = query.key === "summer"
    ? body.items.filter((item) => /^ps2-japon-(?:_summer|summer-jp-best-version)/.test(item.id))
    : body.items;
  liveSnapshots[query.key] = {
    url: query.url,
    capturedAt: new Date().toISOString(),
    returnedTotal: body.total,
    scopedCount: items.length,
    cards: items.map((item) => ({
      catalogId: item.id,
      title: item.title,
      region: item.region,
      slug: item.slug,
      canonicalSeoSlug: item.canonicalSeoSlug,
      coverUrl: item.coverUrl,
      existingPrice: item.recommendedPrice,
      physicalEditionGroup: item.physicalEditionGroup ?? null,
    })),
  };
}

before.publicSnapshots = liveSnapshots;
before.auditStatus = "STATIC_AND_PUBLIC_SNAPSHOT_CAPTURED_RAW_ADMIN_OVERLAY_NOT_EXPORTED";
before.note = "Incluye todas las filas estáticas del alcance y las tarjetas públicas actuales, incluso pending. No es un export raw de Admin ni autoriza borrar o reemplazar filas.";
writeFileSync(artifactPath, `${JSON.stringify(before, null, 2)}\n`);
