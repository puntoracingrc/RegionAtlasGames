import assert from "node:assert/strict";
import test from "node:test";
import type { AdminGameDraft } from "./admin-draft-types";
import { applyDraftPatch, catalogIdAfterIdentityChange } from "./admin-draft-patch";

const legacyIdentity = {
  catalogId: "ps2-jp-slps-25655",
  platformSlug: "ps2",
  slug: "hack-g-u-vol-2-kimi-omou-koe-slps-25655",
  region: "Japón",
};

test("published detail edits preserve a legacy catalog ID", () => {
  const draft = legacyIdentity as AdminGameDraft;
  const patched = applyDraftPatch(draft, { year: 2006, players: 1 });
  assert.equal(patched.catalogId, legacyIdentity.catalogId);
  assert.equal(patched.year, 2006);
});

test("changing slug or region still derives a new catalog ID", () => {
  assert.equal(
    catalogIdAfterIdentityChange(legacyIdentity, { ...legacyIdentity, slug: "new-slug" }),
    "ps2-japon-new-slug",
  );
  assert.equal(
    catalogIdAfterIdentityChange(legacyIdentity, { ...legacyIdentity, region: "USA" }),
    `ps2-usa-${legacyIdentity.slug}`,
  );
});

test("an Admin edit can explicitly remove a wrongly inherited cover", () => {
  const current = { coverUrl: "/covers/wrong-edition.jpg" } as AdminGameDraft;
  assert.equal(applyDraftPatch(current, { coverUrl: null }).coverUrl, null);
  assert.equal(applyDraftPatch(current, { coverUrl: "" }).coverUrl, null);
  assert.equal(applyDraftPatch(current, {}).coverUrl, "/covers/wrong-edition.jpg");
});
