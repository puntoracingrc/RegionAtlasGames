import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import approvalsData from "../../data/research/person-editorial-approvals.json";
import companiesData from "../../data/index/companies.json";
import companyResearchData from "../../data/research/company-study/core.json";
import coreData from "../../data/research/person-study/core.json";
import manifestData from "../../data/research/person-study/manifest.json";
import mediaData from "../../data/research/person-study/media.json";
import publicData from "../../data/research/person-study/public.json";
import relationsData from "../../data/research/person-study/relations.json";
import reviewData from "../../data/research/person-study/review.json";
import sourcesData from "../../data/research/person-study/sources.json";
import worksData from "../../data/research/person-study/works.json";
import buildSitemap from "../app/sitemap";
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
  visibility: "published" | "admin_structured" | "blocked";
  death_year: number | null;
};

type ApprovalProfile = {
  slug: string;
  factSourceIds: string[];
  biographyClaims: { text: string; sourceIds: string[] }[];
  exactCreditIds: string[];
  awardIds: string[];
  positionIds?: string[];
  curiosityIds: string[];
};

type Approvals = {
  profiles: ApprovalProfile[];
  approvedRelations: { id: string; sourceId: string; start?: string }[];
  knownBlockedRelations: Record<string, string>;
  canonicalCompanyAliases: Record<string, string>;
};

type InternalRelation = {
  relation_id: string;
  person_slug: string;
  person_qid: string;
  company_slug: string;
  company_name: string;
  company_qid: string;
  role: string;
  role_start: string;
  role_end: string;
  point_in_time: string;
  relation_origin: string;
  source_id: string;
  requires_review: boolean;
  publication_status: "published" | "internal";
  publication_block_reason: string | null;
};

type InternalWork = {
  work_id: string;
  person_slug: string;
  relationship_precision: "EXACT_EDITORIAL_CREDIT" | "ASSOCIATION_NOT_EXACT_CREDIT";
  publication_status: "published" | "internal";
};

type InternalSource = {
  source_id: string;
  publication_status: "published" | "internal";
};

type InternalMedia = {
  person_slug: string;
  local_path: string | null;
  source_url: string;
  license: string;
  artist: string;
  attribution_required: string;
  publication_status: "published" | "internal_retained" | "internal";
};

type CompanyResearchRecord = {
  slug: string;
  foundedYear: number | null;
};

const approvals = approvalsData as Approvals;
const core = (coreData as { records: CoreRecord[] }).records;
const relations = (relationsData as { records: InternalRelation[] }).records;
const works = (worksData as { records: InternalWork[] }).records;
const sources = (sourcesData as { records: InternalSource[] }).records;
const media = (mediaData as { records: InternalMedia[] }).records;
const review = reviewData as {
  records: { slug: string }[];
  unresolvedMentions: unknown[];
};
const companyResearch = (companyResearchData as { records: CompanyResearchRecord[] }).records;
const manifest = manifestData as unknown as PersonResearchManifest;
const publicResearch = publicData as unknown as PersonPublicData;
const companies = companiesData as Record<string, unknown>;

function sha256File(relativePath: string): string {
  return createHash("sha256")
    .update(readFileSync(path.join(process.cwd(), relativePath)))
    .digest("hex");
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b, "en"));
}

function firstYear(...values: unknown[]): number | null {
  for (const value of values) {
    const match = String(value ?? "").match(/\b(?:18|19|20)\d{2}\b/);
    if (match) return Number(match[0]);
  }
  return null;
}

test("partitions all identities into 25 public, 302 Admin-only and 161 blocked records", () => {
  const publicSlugs = new Set(publicResearch.profiles.map((profile) => profile.slug));
  const approvedSlugs = new Set(approvals.profiles.map((profile) => profile.slug));

  assert.equal(core.length, 488);
  assert.equal(new Set(core.map((person) => person.slug)).size, 488);
  assert.equal(new Set(core.map((person) => person.qid)).size, 488);
  assert.equal(core.filter((person) => person.visibility === "published").length, 25);
  assert.equal(core.filter((person) => person.visibility === "admin_structured").length, 302);
  assert.equal(core.filter((person) => person.visibility === "blocked").length, 161);
  assert.equal(review.records.length, 161);
  assert.equal(review.unresolvedMentions.length, 138);
  assert.deepEqual(sorted(publicSlugs), sorted(approvedSlugs));
  assert.ok(publicResearch.profiles.every((profile) => profile.publicationLevel === "editorial"));
  assert.ok(core.every((person) => !person.automatic_merge_allowed));
  assert.equal(manifest.counts.publishedPeople, 25);
  assert.equal(manifest.policies.structuredIsPublic, false);
  assert.equal(manifest.policies.stagingIsPublic, false);
});

test("builds every public biography and fact source only from explicit editorial approvals", () => {
  const approvalBySlug = new Map(approvals.profiles.map((profile) => [profile.slug, profile]));

  for (const profile of publicResearch.profiles) {
    const approval = approvalBySlug.get(profile.slug);
    assert.ok(approval, profile.slug);
    assert.deepEqual(profile.biographyClaims, approval.biographyClaims, profile.slug);
    assert.equal(
      profile.biographyEs,
      approval.biographyClaims.map((claim) => claim.text).join(" "),
      profile.slug,
    );
    assert.equal(profile.careerSummaryEs, null, profile.slug);
    assert.equal(profile.industryImpactEs, null, profile.slug);
    assert.equal(profile.publicReceptionEs, null, profile.slug);
    const approvedSourceIds = new Set([
      ...approval.factSourceIds,
      ...approval.biographyClaims.flatMap((claim) => claim.sourceIds),
    ]);
    assert.deepEqual(sorted(profile.sourceIds), sorted(approvedSourceIds), profile.slug);
    assert.doesNotMatch(profile.biographyEs, /figura en las fuentes consultadas/i, profile.slug);
    assert.doesNotMatch(profile.biographyEs, /v[ií]nculos corporativos registrados incluyen/i, profile.slug);
  }
});

test("keeps every non-editorial identity out of public routes, sitemap and inverse links", async () => {
  const publicSlugs = new Set(getPublicPersonSlugs());
  const nonPublic = core.filter((person) => person.visibility !== "published");

  assert.equal(publicSlugs.size, 25);
  for (const person of nonPublic) {
    assert.equal(publicSlugs.has(person.slug), false, person.slug);
    assert.equal(getPublicPersonView(person.slug), undefined, person.slug);
  }

  const sitemapSlugs = (await buildSitemap())
    .map((entry) => new URL(entry.url).pathname)
    .filter((pathname) => pathname.startsWith("/persona/"))
    .map((pathname) => decodeURIComponent(pathname.slice("/persona/".length)));
  assert.deepEqual(sorted(sitemapSlugs), sorted(publicSlugs));

  const sitemapSource = readFileSync("src/app/sitemap.ts", "utf-8");
  assert.match(sitemapSource, /getPublicPersonProfiles/);
  assert.doesNotMatch(sitemapSource, /person-study\/(?:core|review)\.json/);
});

test("exports exactly the sources referenced by visible facts and no internal-only source", () => {
  const referenced = new Set<string>();
  for (const profile of publicResearch.profiles) {
    profile.sourceIds.forEach((sourceId) => referenced.add(sourceId));
    profile.biographyClaims.flatMap((claim) => claim.sourceIds).forEach((sourceId) => referenced.add(sourceId));
    Object.values(profile.fieldSources).flat().forEach((sourceId) => referenced.add(sourceId));
    if (profile.portrait) referenced.add(profile.portrait.sourceId);
  }
  for (const row of [
    ...publicResearch.companyRelations,
    ...publicResearch.positions,
    ...publicResearch.exactCredits,
    ...publicResearch.relatedWorks,
    ...publicResearch.awards,
    ...publicResearch.curiosities,
  ]) {
    referenced.add(row.sourceId);
  }

  const publicSourceIds = new Set(publicResearch.sources.map((source) => source.id));
  const internallyPublished = new Set(
    sources
      .filter((source) => source.publication_status === "published")
      .map((source) => source.source_id),
  );
  assert.deepEqual(sorted(publicSourceIds), sorted(referenced));
  assert.deepEqual(sorted(internallyPublished), sorted(referenced));
  assert.ok(
    sources
      .filter((source) => source.publication_status === "internal")
      .every((source) => !publicSourceIds.has(source.source_id)),
  );
});

test("publishes only explicitly approved, independently sourced company relations", () => {
  const approvedById = new Map(approvals.approvedRelations.map((relation) => [relation.id, relation]));
  const internalById = new Map(relations.map((relation) => [relation.relation_id, relation]));

  assert.deepEqual(
    sorted(publicResearch.companyRelations.map((relation) => relation.id)),
    sorted(approvedById.keys()),
  );
  assert.equal(publicResearch.companyRelations.length, 2);
  for (const relation of publicResearch.companyRelations) {
    const approval = approvedById.get(relation.id);
    const internal = internalById.get(relation.id);
    const source = publicResearch.sources.find((item) => item.id === relation.sourceId);
    assert.ok(approval && internal && source, relation.id);
    assert.equal(internal.requires_review, false, relation.id);
    assert.notEqual(internal.relation_origin, "WIKIDATA_P108", relation.id);
    assert.equal(relation.sourceId, approval.sourceId, relation.id);
    assert.equal(relation.verificationStatus, "INDEPENDENT_SOURCE_VERIFIED", relation.id);
    assert.equal(source.verifiedPrimary, true, relation.id);
    assert.equal(source.reliability, "HIGH", relation.id);
    assert.ok(companies[relation.companySlug], relation.companySlug);
    assert.ok(
      getPublicPeopleForCompany(relation.companySlug).some((person) => person.slug === relation.personSlug),
      relation.id,
    );
  }
  assert.equal(manifest.policies.wikidataOnlyRelationIsVerified, false);
  assert.equal(manifest.policies.reviewRelationIsPublic, false);
});

test("blocks every known homonym, chronology and parent-company inheritance case", () => {
  const publicIds = new Set(publicResearch.companyRelations.map((relation) => relation.id));
  const relationById = new Map(relations.map((relation) => [relation.relation_id, relation]));

  assert.equal(Object.keys(approvals.knownBlockedRelations).length, 10);
  for (const [relationId, reason] of Object.entries(approvals.knownBlockedRelations)) {
    const relation = relationById.get(relationId);
    assert.ok(relation, relationId);
    assert.equal(relation.publication_status, "internal", relationId);
    assert.equal(relation.publication_block_reason, reason, relationId);
    assert.equal(publicIds.has(relationId), false, relationId);
  }

  for (const relationId of ["PCR-00319", "PCR-00320", "PCR-00322", "PCR-00513", "PCR-00514"]) {
    assert.match(
      relationById.get(relationId)?.publication_block_reason ?? "",
      /hereda|autom[aá]ticamente|divisi[oó]n|no convierte/i,
    );
  }
  for (const relationId of ["PCR-00603", "PCR-00604"]) {
    const relation = relationById.get(relationId);
    assert.equal(relation?.company_qid, "Q664420");
    assert.match(relation?.publication_block_reason ?? "", /Hom[oó]nimo/);
  }
  for (const relationId of ["PCR-00765", "PCR-00766"]) {
    const relation = relationById.get(relationId);
    assert.equal(relation?.relation_origin, "WIKIDATA_P108");
    assert.equal(relation?.publication_status, "internal");
  }
  assert.equal(manifest.counts.explicitlyBlockedRelations, 10);
  assert.equal(manifest.counts.removedPublicRelations, 85);
  assert.equal(manifest.counts.internalCompanyRelations, 909);
});

test("rejects implausible relation chronology and dates founder relations at company origin", () => {
  const peopleBySlug = new Map(core.map((person) => [person.slug, person]));
  const companiesBySlug = new Map(companyResearch.map((company) => [company.slug, company]));

  for (const relation of publicResearch.companyRelations) {
    const person = peopleBySlug.get(relation.personSlug);
    const company = companiesBySlug.get(relation.companySlug);
    assert.ok(person && company, relation.id);
    const relationYears = [
      firstYear(relation.start),
      firstYear(relation.pointInTime),
      firstYear(relation.end),
    ].filter((year): year is number => year !== null);
    if (person.death_year) {
      assert.ok(relationYears.every((year) => year <= person.death_year!), relation.id);
      if (company.foundedYear) assert.ok(company.foundedYear <= person.death_year, relation.id);
    }
    if (relation.role.includes("FOUNDER") && company.foundedYear) {
      assert.equal(firstYear(relation.start, relation.pointInTime), company.foundedYear, relation.id);
    }
  }
});

test("uses canonical company aliases without merging or duplicating source records", () => {
  const seen = new Set<string>();
  for (const relation of publicResearch.companyRelations) {
    const canonical = approvals.canonicalCompanyAliases[relation.companySlug] ?? relation.companySlug;
    const key = `${relation.personSlug}:${canonical}`;
    assert.equal(seen.has(key), false, relation.id);
    seen.add(key);
  }
  for (const [alias, canonical] of Object.entries(approvals.canonicalCompanyAliases)) {
    assert.ok(companies[alias], alias);
    assert.ok(companies[canonical], canonical);
  }
});

test("keeps contextual works internal and exposes only exact approved credits", () => {
  const contextual = works.filter(
    (work) => work.relationship_precision === "ASSOCIATION_NOT_EXACT_CREDIT",
  );
  const approvedCreditIds = new Set(
    approvals.profiles.flatMap((profile) => profile.exactCreditIds),
  );

  assert.equal(publicResearch.exactCredits.length, 63);
  assert.equal(publicResearch.relatedWorks.length, 0);
  assert.equal(contextual.length, 184);
  assert.ok(contextual.every((work) => work.publication_status === "internal"));
  assert.ok(
    publicResearch.exactCredits.every(
      (work) =>
        work.relationshipPrecision === "EXACT_EDITORIAL_CREDIT" &&
        approvedCreditIds.has(work.id),
    ),
  );
  assert.equal(manifest.policies.contextualWorkIsExactCredit, false);
});

test("limits public child records to approved people and allowlists", () => {
  const publicSlugs = new Set(getPublicPersonSlugs());
  assert.equal(publicResearch.awards.length, 31);
  assert.equal(publicResearch.positions.length, 0);
  assert.equal(publicResearch.curiosities.length, 18);
  for (const row of [
    ...publicResearch.awards,
    ...publicResearch.positions,
    ...publicResearch.curiosities,
  ]) {
    assert.ok(publicSlugs.has(row.personSlug), row.id);
  }
});

test("retains 217 normalized portraits and publishes only the 21 editorial portraits", () => {
  const publicPortraits = publicResearch.profiles.flatMap(
    (profile) => profile.portrait ? [profile.portrait] : [],
  );
  const retainedMedia = media.filter((item) => item.local_path);

  assert.equal(publicPortraits.length, 21);
  assert.equal(retainedMedia.length, 217);
  assert.equal(Object.keys(manifest.portraitHashes).length, 217);
  assert.equal(media.filter((item) => item.publication_status === "published").length, 21);
  assert.equal(media.filter((item) => item.publication_status === "internal_retained").length, 196);
  for (const item of retainedMedia) {
    assert.ok(item.license, item.person_slug);
    assert.match(item.source_url, /^https?:\/\//, item.person_slug);
    if (item.attribution_required === "true") assert.ok(item.artist, item.person_slug);
  }
  for (const [slug, expectedHash] of Object.entries(manifest.portraitHashes)) {
    const relativePath = `public/person-portraits/${slug}.webp`;
    assert.equal(sha256File(relativePath), expectedHash, slug);
    const file = readFileSync(relativePath);
    assert.equal(file.subarray(0, 4).toString("ascii"), "RIFF", slug);
    assert.equal(file.subarray(8, 12).toString("ascii"), "WEBP", slug);
    assert.equal(file.includes(Buffer.from("Exif")), false, slug);
  }
});

test("keeps public JSON free from review fields, internal records and generic SEO text", () => {
  const serialized = JSON.stringify(publicResearch);
  assert.doesNotMatch(serialized, /STAGING_REVIEW|READY_STRUCTURED|admin_structured/);
  assert.doesNotMatch(serialized, /review_reasons|requires_review|publication_status/);
  assert.doesNotMatch(serialized, /figura en las fuentes consultadas/i);
  assert.doesNotMatch(serialized, /home_address|phone_number|religion|sexual_orientation|medical|family_members/);
  for (const relation of relations.filter((item) => item.publication_status === "internal")) {
    assert.equal(
      publicResearch.companyRelations.some((item) => item.id === relation.relation_id),
      false,
      relation.relation_id,
    );
  }
});

test("preserves catalog, company and prior research files byte for byte", () => {
  for (const [relativePath, expectedHash] of Object.entries(manifest.protectedFileHashes)) {
    assert.equal(sha256File(relativePath), expectedHash, relativePath);
  }
  assert.deepEqual(
    manifest.protectedFileHashUpdates?.map((update) => update.batchId),
    [
      "company-credit-verified-batch-1",
      "company-credit-ps4-pal-batch-1",
      "company-credit-ps4-pal-high-additions-1",
      "company-credit-ps4-pal-rapid-review-2026-09-05",
    ],
  );
});

test("public modules never import internal people datasets", () => {
  const loader = readFileSync("src/lib/person-public-research.ts", "utf-8");
  const publicPage = readFileSync("src/app/persona/[slug]/page.tsx", "utf-8");
  const sitemap = readFileSync("src/app/sitemap.ts", "utf-8");
  for (const source of [loader, publicPage, sitemap]) {
    assert.doesNotMatch(source, /person-study\/(?:core|review|relations|sources|provenance)\.json/);
    assert.doesNotMatch(source, /admin-person-research/);
  }
});
