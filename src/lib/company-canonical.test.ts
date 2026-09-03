import assert from "node:assert/strict";
import test from "node:test";

import companySeparationsData from "../../data/company-separations.json";
import {
  mergeCompanyIndex,
  resolveCanonicalCompany,
  resolveCanonicalCompanySlug,
} from "./company-canonical";
import type { IndexEntry } from "./types";

test("approved company separations override every legacy merge hint", () => {
  const independentSlugs = companySeparationsData.separations.flatMap(
    (decision) => decision.independentSlugs,
  );

  assert.equal(independentSlugs.length, 78);
  for (const slug of independentSlugs) {
    assert.equal(
      resolveCanonicalCompanySlug(slug, {
        name: "Shared Company Europe Ltd.",
        wikidataId: "Q-SHARED",
        museumPath: "/desarrolladoras-de-software/shared-company",
      }),
      slug,
    );
  }
});

test("approved canonical display names override stale manual group names", () => {
  assert.deepEqual(resolveCanonicalCompany("acclaim", "Acclaim Japan"), {
    slug: "acclaim",
    name: "Acclaim Entertainment",
  });
  assert.deepEqual(resolveCanonicalCompany("idea-factory", "Idea Factory"), {
    slug: "idea-factory",
    name: "Idea Factory Co., Ltd.",
  });
});

test("blocked audit clusters keep their previous canonical mapping", () => {
  assert.equal(resolveCanonicalCompanySlug("atari-europe"), "atari");
  assert.equal(resolveCanonicalCompanySlug("snk-corporation"), "snk");
});

test("company index merging keeps an approved subsidiary independent", () => {
  const entries: Record<string, IndexEntry> = {
    nintendo: {
      name: "Nintendo",
      slug: "nintendo",
      museumPath: "",
      gameIds: ["parent-game"],
      gameCount: 1,
      byPlatform: { switch: 1 },
      asPublisher: ["parent-game"],
    },
    "nintendo-software-technology": {
      name: "Nintendo Software Technology",
      slug: "nintendo-software-technology",
      museumPath: "",
      gameIds: ["studio-game"],
      gameCount: 1,
      byPlatform: { n64: 1 },
      asDeveloper: ["studio-game"],
    },
  };

  const merged = mergeCompanyIndex(entries);
  assert.deepEqual(Object.keys(merged).sort(), [
    "nintendo",
    "nintendo-software-technology",
  ]);
  assert.deepEqual(merged["nintendo"].gameIds, ["parent-game"]);
  assert.deepEqual(merged["nintendo-software-technology"].gameIds, ["studio-game"]);
});
