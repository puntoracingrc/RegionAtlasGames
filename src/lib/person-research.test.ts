import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import companiesData from "../../data/index/companies.json";
import coreData from "../../data/research/person-study/core.json";
import manifestData from "../../data/research/person-study/manifest.json";
import publicData from "../../data/research/person-study/public.json";
import reviewData from "../../data/research/person-study/review.json";
import {
  getPublicPeopleForCompany,
  getPublicPersonSlugs,
  getPublicPersonView,
} from "./person-public-research";
import type {
  PersonPublicData,
  PersonResearchManifest,
} from "./person-research-types";

type CoreRecord = {
  slug: string;
  qid: string;
  publication_status: string;
  requires_review: boolean;
  automatic_merge_allowed: boolean;
  visibility: string;
};

const core = (coreData as { records: CoreRecord[] }).records;
const review = reviewData as {
  records: { slug: string }[];
  unresolvedMentions: unknown[];
};
const manifest = manifestData as unknown as PersonResearchManifest;
const publicResearch = publicData as unknown as PersonPublicData;
const companies = companiesData as Record<string, unknown>;

function sha256File(relativePath: string): string {
  return createHash("sha256")
    .update(readFileSync(path.join(process.cwd(), relativePath)))
    .digest("hex");
}

test("partitions the 488 confirmed identities into public and staging sets", () => {
  assert.equal(core.length, 488);
  assert.equal(publicResearch.profiles.length, 327);
  assert.equal(review.records.length, 161);
  assert.equal(publicResearch.profiles.filter((profile) => profile.publicationLevel === "editorial").length, 25);
  assert.equal(publicResearch.profiles.filter((profile) => profile.publicationLevel === "structured").length, 302);
  assert.equal(new Set(core.map((person) => person.slug)).size, 488);
  assert.equal(new Set(core.map((person) => person.qid)).size, 488);
  assert.ok(core.every((person) => !person.automatic_merge_allowed));
});

test("keeps every staging identity out of public loaders and routes", () => {
  const publicSlugs = new Set(getPublicPersonSlugs());
  assert.equal(publicSlugs.size, 327);
  for (const staged of review.records) {
    assert.equal(publicSlugs.has(staged.slug), false, staged.slug);
    assert.equal(getPublicPersonView(staged.slug), undefined);
  }
  assert.equal(review.unresolvedMentions.length, 138);
});

test("publishes only canonical company relations and exposes inverse links", () => {
  assert.equal(publicResearch.companyRelations.length, 87);
  for (const relation of publicResearch.companyRelations) {
    assert.ok(companies[relation.companySlug], relation.companySlug);
    assert.ok(
      getPublicPeopleForCompany(relation.companySlug).some((person) => person.slug === relation.personSlug),
      relation.id,
    );
  }
});

test("separates exact credits from contextual notable-work associations", () => {
  assert.equal(publicResearch.exactCredits.length, 63);
  assert.equal(publicResearch.relatedWorks.length, 159);
  const exactIds = new Set(publicResearch.exactCredits.map((work) => work.id));
  assert.ok(publicResearch.relatedWorks.every((work) => !exactIds.has(work.id)));
  assert.ok(publicResearch.relatedWorks.every((work) => work.role === "NOTABLE_WORK_ASSOCIATION"));
  assert.equal(manifest.policies.contextualWorkIsExactCredit, false);
});

test("limits public awards, positions and curiosities to reviewed child records", () => {
  assert.equal(publicResearch.awards.length, 173);
  assert.equal(publicResearch.positions.length, 15);
  assert.equal(publicResearch.curiosities.length, 25);
  const publicSlugs = new Set(getPublicPersonSlugs());
  for (const row of [
    ...publicResearch.awards,
    ...publicResearch.positions,
    ...publicResearch.curiosities,
  ]) {
    assert.ok(publicSlugs.has(row.personSlug));
  }
});

test("uses local normalized portraits while retaining attribution", () => {
  const portraits = publicResearch.profiles.flatMap((profile) => profile.portrait ? [profile.portrait] : []);
  assert.equal(portraits.length, 217);
  assert.equal(Object.keys(manifest.portraitHashes).length, 217);
  for (const portrait of portraits) {
    assert.match(portrait.path, /^\/person-portraits\/[a-z0-9-]+\.webp$/);
    assert.doesNotMatch(portrait.path, /^https?:/);
    assert.match(portrait.sourceUrl, /^https?:\/\//);
    assert.ok(portrait.license);
    if (portrait.attributionRequired) assert.ok(portrait.artist);
    const file = readFileSync(path.join(process.cwd(), "public", portrait.path));
    assert.equal(file.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(file.subarray(8, 12).toString("ascii"), "WEBP");
    assert.equal(file.includes(Buffer.from("Exif")), false);
  }
});

test("keeps public person data free from staging flags and sensitive fields", () => {
  const serialized = JSON.stringify(publicResearch);
  assert.doesNotMatch(serialized, /STAGING_REVIEW|review_reasons|requires_review/);
  assert.doesNotMatch(serialized, /home_address|phone_number|religion|sexual_orientation|medical|family_members/);
});

test("every public child record and portrait resolves to a public source", () => {
  const sourceIds = new Set(publicResearch.sources.map((source) => source.id));
  for (const profile of publicResearch.profiles) {
    for (const sourceId of profile.sourceIds) assert.ok(sourceIds.has(sourceId), sourceId);
    if (profile.portrait) assert.ok(sourceIds.has(profile.portrait.sourceId));
  }
  for (const row of [
    ...publicResearch.companyRelations,
    ...publicResearch.positions,
    ...publicResearch.exactCredits,
    ...publicResearch.relatedWorks,
    ...publicResearch.awards,
    ...publicResearch.curiosities,
  ]) {
    assert.ok(sourceIds.has(row.sourceId), row.sourceId);
  }
});

test("preserves canonical catalog, company and prior research files byte for byte", () => {
  for (const [relativePath, expectedHash] of Object.entries(manifest.protectedFileHashes)) {
    assert.equal(sha256File(relativePath), expectedHash, relativePath);
  }
});

test("public modules never import internal people datasets", () => {
  const loader = readFileSync("src/lib/person-public-research.ts", "utf-8");
  const publicPage = readFileSync("src/app/persona/[slug]/page.tsx", "utf-8");
  const sitemap = readFileSync("src/app/sitemap.ts", "utf-8");
  for (const source of [loader, publicPage, sitemap]) {
    assert.doesNotMatch(source, /core\.json|review\.json|provenance\.json|admin-person-research/);
  }
});
