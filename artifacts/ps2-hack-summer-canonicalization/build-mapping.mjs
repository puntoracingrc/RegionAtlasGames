import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("./", import.meta.url);
const before = JSON.parse(readFileSync(new URL("before.json", root), "utf8"));

const exact = new Map(Object.entries({
  "ps2-japon-_summer": ["summer", "standard", "SLPM-66460"],
  "ps2-japon-_summer-first-print-limited-edition": ["summer", "first-print-limited", "GN-06017"],
  "ps2-hack-infection": ["hack-infection", "standard-eu", "SLES-52237"],
  "ps2-usa-hack-infection": ["hack-infection", "standard-us", "SLUS-20267"],
  "ps2-jp-slps-25121": ["hack-infection", "standard-jp", "SLPS-25121"],
  "ps2-kr-slka-25080": ["hack-infection", "standard-kr", "SLKA-25080"],
  "ps2-eu-sles-52467": ["hack-mutation", "standard-eu", "SLES-52467"],
  "ps2-us-slus-20562": ["hack-mutation", "standard-us", "SLUS-20562"],
  "ps2-kr-slka-25138": ["hack-mutation", "standard-kr", "SLKA-25138"],
  "ps2-eu-sles-52469": ["hack-outbreak", "standard-eu", "SLES-52469"],
  "ps2-us-slus-20563": ["hack-outbreak", "standard-us", "SLUS-20563"],
  "ps2-kr-slka-25145": ["hack-outbreak", "standard-kr", "SLKA-25145"],
  "ps2-eu-sles-52468": ["hack-quarantine", "standard-eu", "SLES-52468"],
  "ps2-us-slus-20564": ["hack-quarantine", "standard-us", "SLUS-20564"],
  "ps2-jp-slps-25202": ["hack-quarantine", "standard-jp", "SLPS-25202"],
  "ps2-jp-slps-25651": ["hack-gu-vol-1", "standard-jp", "SLPS-25651"],
  "ps2-jp-slps-73259-playstatiion-2-the-best": ["hack-gu-vol-1", "ps2-the-best-jp", "SLPS-73259"],
  "ps2-jp-slps-25655": ["hack-gu-vol-2", "standard-jp", "SLPS-25655"],
  "ps2-us-slus-21488": ["hack-gu-vol-2", "standard-us", "SLUS-21488"],
  "ps2-jp-slps-73266-playstatiion-2-the-best": ["hack-gu-vol-2", "ps2-the-best-jp", "SLPS-73266"],
  "ps2-us-slus-21489": ["hack-gu-vol-3", "standard-us", "SLUS-21489"],
}));

const titleOnly = new Map(Object.entries({
  "ps2-hack-mutation": "hack-mutation",
  "ps2-hack-outbreak": "hack-outbreak",
  "ps2-hack-quarantine": "hack-quarantine",
  "ps2-usa-hack-gu-rebirth": "hack-gu-vol-1",
  "ps2-usa-hack-gu-rebirth-special-edition": "hack-gu-vol-1",
  "ps2-usa-hack-gu-redemption": "hack-gu-vol-3",
  "ps2-usa-hack-gu-reminisce": "hack-gu-vol-2",
  "ps2-usa-hack-mutation": "hack-mutation",
  "ps2-usa-hack-outbreak": "hack-outbreak",
  "ps2-usa-hack-quarantine": "hack-quarantine",
  "ps2-japon-hack-fragment": "hack-fragment",
  "ps2-japon-hack-fragment-early-release-version": "hack-fragment",
  "ps2-japon-hack-infection": "hack-infection",
  "ps2-japon-hack-mutation": "hack-mutation",
  "ps2-japon-hack-outbreak-vol-3": "hack-outbreak",
  "ps2-japon-hack-quarantine": "hack-quarantine",
  "ps2-japon-hack-gu-rebirth": "hack-gu-vol-1",
  "ps2-japon-hack-gu-redemption": "hack-gu-vol-3",
  "ps2-japon-hack-gu-reminisce": "hack-gu-vol-2",
}));

const compilation = new Map(Object.entries({
  "ps2-japon-hackvol-1-x-vol-2": ["hack-vol-1-x-vol-2", "4543112415325", ["SLPS-73230", "SLPS-73231"]],
  "ps2-japon-hackvol-3-x-vol-4": ["hack-vol-3-x-vol-4", "4543112415332", ["SLPS-73232", "SLPS-73233"]],
  "ps2-jp-slps-73233-playstation-2-the-best": ["hack-vol-3-x-vol-4", "4543112415332", ["SLPS-73232", "SLPS-73233"]],
}));

const mapping = before.rows.map((row) => {
  const base = { catalogId: row.catalogId, currentRoute: row.route };
  if (exact.has(row.catalogId)) {
    const [workKey, familyKey, verifiedSerial] = exact.get(row.catalogId);
    return { ...base, workKey, familyKey, verifiedSerial, state: "IDENTITY_MATCHED_BY_SERIAL", action: "preserve_id_and_price_identity" };
  }
  if (compilation.has(row.catalogId)) {
    const [productKey, verifiedEan, discSerials] = compilation.get(row.catalogId);
    return { ...base, productKey, editionType: "COMPILATION", verifiedEan, discSerials,
      state: row.catalogId.startsWith("ps2-jp-slps-73233") ? "DISC_BRIDGE_PENDING_REVIEW" : "PRODUCT_TITLE_MATCH_PHYSICAL_LINK_PENDING",
      action: "preserve_route_and_collection_until_bridge_verified" };
  }
  if (titleOnly.has(row.catalogId)) {
    return { ...base, proposedWorkKey: titleOnly.get(row.catalogId), state: "TITLE_MATCH_ONLY_PHYSICAL_IDENTITY_UNRESOLVED",
      action: "do_not_merge_or_redirect_yet" };
  }
  return { ...base, state: "OUT_OF_MAIN_WORK_OR_BONUS", action: "preserve_and_review_separately" };
});

const output = {
  schemaVersion: 1,
  status: "AUDIT_MAPPING_NOT_APPLIED",
  generatedAt: "2026-09-23",
  canonicalEntityCount: { gameWorks: 9, compilationProducts: 2 },
  overlayOnly: [{ catalogId: "ps2-japon-summer-jp-best-version", workKey: "summer", familyKey: "best-version", serial: "SLPM-66877", state: "EXISTING_ADMIN_OVERLAY" }],
  mapping,
};
writeFileSync(new URL("mapping-old-to-canonical.json", root), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Mapped ${mapping.length} pre-existing static rows.`);
