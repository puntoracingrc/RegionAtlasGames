import "server-only";

import companiesData from "../../data/index/companies.json";
import coreData from "../../data/research/company-study/core.json";
import manifestData from "../../data/research/company-study/manifest.json";
import provenanceData from "../../data/research/company-study/provenance.json";
import publicData from "../../data/research/company-study/public.json";
import relationshipDecisionsData from "../../data/research/company-study/relationship-decisions.json";
import reviewData from "../../data/research/company-study/review.json";
import sourcesData from "../../data/research/company-study/sources.json";
import type {
  CompanyResearchAdminOverview,
  CompanyResearchAdminRecord,
  CompanyResearchBlockedRecord,
  CompanyResearchCore,
  CompanyResearchManifest,
  CompanyResearchPublicData,
} from "./company-research-types";
import type { ResearchFieldProvenance } from "./research-types";
import type { IndexEntry } from "./types";

type ReviewFile = {
  records: CompanyResearchBlockedRecord[];
  qidCollisionGroups: { qid: string; slugs: string[] }[];
};

type RelationshipDecisionsFile = {
  externallyVerifiedExclusions: {
    companySlug: string;
    reason: string;
    sourceId: string;
  }[];
};

export type CompanyResearchAdminFilter = CompanyResearchAdminOverview["filter"];

const manifest = manifestData as CompanyResearchManifest;
const core = (coreData as { records: CompanyResearchCore[] }).records;
const blocked = (reviewData as ReviewFile).records;
const provenance = (provenanceData as { records: ResearchFieldProvenance[] }).records;
const publicResearch = publicData as CompanyResearchPublicData;
const relationshipDecisions = relationshipDecisionsData as RelationshipDecisionsFile;
const companies = companiesData as Record<string, IndexEntry>;
const sourceUrlById = new Map(
  (sourcesData as { records: { id: string; url: string }[] }).records.map((source) => [
    source.id,
    source.url,
  ]),
);

const provenanceCountBySlug = provenance.reduce((counts, row) => {
  counts.set(row.subjectSlug, (counts.get(row.subjectSlug) ?? 0) + 1);
  return counts;
}, new Map<string, number>());

const collisionSlugs = new Set(
  (reviewData as ReviewFile).qidCollisionGroups.flatMap((group) => group.slugs),
);

const publicChangesBySlug = new Map<string, string[]>();
for (const profile of publicResearch.profiles) {
  const changes = publicChangesBySlug.get(profile.slug) ?? [];
  if (profile.identityCorrection) changes.push("QID corregido");
  if (profile.history) changes.push("Historia publicada");
  publicChangesBySlug.set(profile.slug, changes);
}
for (const achievement of publicResearch.achievements) {
  const changes = publicChangesBySlug.get(achievement.companySlug) ?? [];
  if (!changes.includes("Hitos publicados")) changes.push("Hitos publicados");
  publicChangesBySlug.set(achievement.companySlug, changes);
}

function normalizeSearch(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function acceptedRecord(record: CompanyResearchCore): CompanyResearchAdminRecord {
  return {
    slug: record.slug,
    name: companies[record.slug]?.name ?? record.slug,
    gate: "accepted",
    qid: record.wikidataId,
    confidence: record.researchConfidence,
    status: record.status ?? null,
    foundedYear: record.foundedYear ?? null,
    closedYear: record.closedYear ?? null,
    countries: record.countries ?? [],
    provenanceCount: provenanceCountBySlug.get(record.slug) ?? 0,
    reasons: [],
    publicChanges: publicChangesBySlug.get(record.slug) ?? [],
  };
}

function blockedRecord(record: CompanyResearchBlockedRecord): CompanyResearchAdminRecord {
  return {
    slug: record.slug,
    name: record.name,
    gate: "blocked",
    qid: record.qid,
    confidence: record.confidence,
    status: null,
    foundedYear: null,
    closedYear: null,
    countries: [],
    provenanceCount: 0,
    reasons: record.reasons,
    publicChanges: [],
  };
}

function matchesFilter(record: CompanyResearchAdminRecord, filter: CompanyResearchAdminFilter) {
  if (filter === "accepted") return record.gate === "accepted";
  if (filter === "blocked") return record.gate === "blocked";
  if (filter === "published") return record.publicChanges.length > 0;
  if (filter === "qid-collision") return collisionSlugs.has(record.slug);
  return true;
}

export function getAdminCompanyResearchOverview(input?: {
  query?: string;
  filter?: CompanyResearchAdminFilter;
  page?: number;
  pageSize?: number;
}): CompanyResearchAdminOverview {
  const query = input?.query?.trim() ?? "";
  const normalizedQuery = normalizeSearch(query);
  const filter = input?.filter ?? "all";
  const pageSize = Math.min(100, Math.max(20, input?.pageSize ?? 50));
  const allRecords = [...core.map(acceptedRecord), ...blocked.map(blockedRecord)]
    .filter((record) => matchesFilter(record, filter))
    .filter((record) => {
      if (!normalizedQuery) return true;
      return normalizeSearch(`${record.name} ${record.slug} ${record.qid ?? ""}`).includes(
        normalizedQuery,
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
  const totalPages = Math.max(1, Math.ceil(allRecords.length / pageSize));
  const page = Math.min(totalPages, Math.max(1, input?.page ?? 1));
  const start = (page - 1) * pageSize;

  return {
    manifest,
    records: allRecords.slice(start, start + pageSize),
    total: allRecords.length,
    page,
    pageSize,
    totalPages,
    filter,
    query,
    relationshipExclusions: relationshipDecisions.externallyVerifiedExclusions.map((item) => ({
      ...item,
      sourceUrl: sourceUrlById.get(item.sourceId) ?? null,
    })),
  };
}
