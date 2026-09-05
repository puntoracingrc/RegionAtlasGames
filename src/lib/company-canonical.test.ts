import assert from "node:assert/strict";
import test from "node:test";

import companyProfilesData from "../../data/company-profiles.json";
import companySeparationsData from "../../data/company-separations.json";
import {
  mergeCompanyIndex,
  resolveCanonicalCompany,
  resolveCanonicalCompanySlug,
} from "./company-canonical";
import { buildCompanyProfileView } from "./company-profile";
import { buildCompanyIntro } from "./company-seo";
import type { CompanyProfile } from "./types";
import type { IndexEntry } from "./types";

const companyProfiles = companyProfilesData as Record<string, CompanyProfile>;

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

test("company index merging preserves reviewed display-name aliases", () => {
  const merged = mergeCompanyIndex({
    digerati: {
      name: "Digerati",
      slug: "digerati",
      museumPath: "",
      gameIds: ["published-game"],
      gameCount: 1,
      byPlatform: { ps4: 1 },
      asPublisher: ["published-game"],
      aliasNames: ["Digerati Distribution"],
    },
  });

  assert.deepEqual(merged.digerati.aliasNames, ["Digerati Distribution"]);
});

test("editorial profiles follow the detached regional entities they describe", () => {
  const movedProfiles = {
    "acclaim-japan": "Acclaim Japan, Ltd.",
    "idea-factory-international": "Idea Factory International",
    "koei-tecmo-europe-ltd": "Koei Tecmo Europe Ltd.",
    "marvelous-europe": "Marvelous Europe",
    "nec-international": "Nec International",
    "take-two-interactive-europe": "Take Two Interactive Europe",
  };

  for (const [slug, name] of Object.entries(movedProfiles)) {
    assert.equal(companyProfiles[slug]?.slug, slug);
    assert.equal(companyProfiles[slug]?.name, name);
  }

  for (const slug of [
    "acclaim",
    "idea-factory",
    "koei-tecmo",
    "marvelous",
    "nec",
    "take-two-interactive",
  ]) {
    assert.equal(companyProfiles[slug], undefined);
  }
});

test("generated company copy reads current catalog counts at render time", () => {
  const view = buildCompanyProfileView("square-enix");
  assert.ok(view);
  assert.equal(view.history, null);
  assert.equal(view.seoDescription, null);
  assert.equal(view.profilePending, false);
  const intro = buildCompanyIntro(view);
  assert.match(intro, new RegExp(`\\b${view.catalogEntryCount} fichas\\b`));
  assert.doesNotMatch(intro, /\.\.$/);
});

test("company profiles expose verified corporate relations without merging entities", () => {
  const regional = buildCompanyProfileView("koei-tecmo-europe");
  assert.ok(regional);
  assert.ok(
    regional.verifiedRelations.some(
      (relation) =>
        relation.label === "Entidad regional de" &&
        relation.company.slug === "koei-tecmo-games" &&
        Boolean(relation.evidenceUrl),
    ),
  );
  assert.notEqual(regional.slug, "koei-tecmo-games");
});
