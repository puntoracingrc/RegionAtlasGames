import assert from "node:assert/strict";
import test from "node:test";
import type { CatalogPhysicalReleaseGroup } from "./types";
import { buildPhysicalReleaseImageUploadSlug, upsertPhysicalReleaseImage } from "./admin-physical-release-image";
import { buildCoverBlobPath, buildCoverFileSlug } from "./covers-upload";

const group: CatalogPhysicalReleaseGroup = {
  id: "n64-test-us",
  label: "USA",
  coverUrl: "/old-front.jpg",
  images: [],
};

test("a back cover is added without changing the group cover", () => {
  const next = upsertPhysicalReleaseImage(group, {
    role: "back",
    url: "/test-back.jpg",
    width: 1200,
    height: 900,
    evidenceType: "REAL_SCAN",
  });

  assert.equal(next.coverUrl, "/old-front.jpg");
  assert.deepEqual(next.images, [{
    key: "n64-test-us:back",
    placement: "GALLERY",
    url: "/test-back.jpg",
    thumbnailUrl: "/test-back.jpg",
    width: 1200,
    height: 900,
    caption: "Contraportada",
    evidenceType: "REAL_SCAN",
  }]);
});

test("a front cover replaces the previous front image and becomes the group cover", () => {
  const first = upsertPhysicalReleaseImage(group, {
    role: "front",
    url: "/first-front.jpg",
    width: 900,
    height: 1200,
    evidenceType: "REAL_PHOTO",
  });
  const next = upsertPhysicalReleaseImage(first, {
    role: "front",
    url: "/second-front.jpg",
    width: 1000,
    height: 1400,
    evidenceType: "REAL_SCAN",
  });

  assert.equal(next.coverUrl, "/second-front.jpg");
  assert.equal(next.images?.length, 1);
  assert.equal(next.images?.[0]?.url, "/second-front.jpg");
});

test("a contents image uses the contents placement", () => {
  const next = upsertPhysicalReleaseImage(group, {
    role: "contents",
    url: "/contents.jpg",
    width: 1200,
    height: 900,
    evidenceType: "REAL_PHOTO",
  });

  assert.equal(next.images?.[0]?.placement, "CONTENTS");
});

test("front and back physical uploads cannot resolve to the same CDN path", () => {
  const catalogId = "ps2-japon-_summer";
  const version = "20260923064000";
  const pathFor = (role: "front" | "back") => buildCoverBlobPath("ps2", buildCoverFileSlug({
    slug: buildPhysicalReleaseImageUploadSlug({ catalogId, role, version }),
  }));

  assert.equal(pathFor("front"), "/catalog-covers/runtime/ps2/ps2-japon-summer-front-20260923064000.jpg");
  assert.equal(pathFor("back"), "/catalog-covers/runtime/ps2/ps2-japon-summer-back-20260923064000.jpg");
  assert.notEqual(pathFor("front"), pathFor("back"));
});
