import "server-only";

import coreData from "../../data/research/person-study/core.json";
import manifestData from "../../data/research/person-study/manifest.json";
import relationsData from "../../data/research/person-study/relations.json";
import worksData from "../../data/research/person-study/works.json";
import type {
  PersonAdminFilter,
  PersonAdminOverview,
  PersonAdminRecord,
  PersonResearchManifest,
  PersonResearchTerm,
} from "./person-research-types";

type InternalPerson = {
  slug: string;
  name: string;
  qid: string;
  publication_status: string;
  confidence: string;
  birth_year: number | null;
  origin_display: string;
  occupations: PersonResearchTerm[];
  review_reasons: string[];
  source_ids: string[];
  portrait: unknown;
  visibility: "published" | "admin_only";
};

type InternalRelation = { person_slug: string; publication_status: string };
type InternalWork = {
  person_slug: string;
  relationship_precision: string;
  publication_status: string;
};

const manifest = manifestData as unknown as PersonResearchManifest;
const people = (coreData as { records: InternalPerson[] }).records;
const relations = (relationsData as { records: InternalRelation[] }).records;
const works = (worksData as { records: InternalWork[] }).records;

function normalize(value: string): string {
  return value.toLocaleLowerCase("es").normalize("NFD").replace(/\p{M}/gu, "");
}

function gateFor(person: InternalPerson): PersonAdminRecord["gate"] {
  if (person.visibility !== "published") return "staging";
  return person.publication_status === "READY_EDITORIAL" ? "editorial" : "structured";
}

function matchesFilter(record: PersonAdminRecord, filter: PersonAdminFilter): boolean {
  if (filter === "all") return true;
  if (filter === "published") return record.gate !== "staging";
  return record.gate === filter;
}

const relationCounts = relations.reduce((counts, row) => {
  counts.set(row.person_slug, (counts.get(row.person_slug) ?? 0) + 1);
  return counts;
}, new Map<string, number>());

const exactCreditCounts = works.reduce((counts, row) => {
  if (row.relationship_precision !== "EXACT_EDITORIAL_CREDIT") return counts;
  counts.set(row.person_slug, (counts.get(row.person_slug) ?? 0) + 1);
  return counts;
}, new Map<string, number>());

function toAdminRecord(person: InternalPerson): PersonAdminRecord {
  return {
    slug: person.slug,
    name: person.name,
    qid: person.qid,
    gate: gateFor(person),
    confidence: person.confidence,
    birthYear: person.birth_year,
    origin: person.origin_display || null,
    occupations: person.occupations.map((occupation) => occupation.name),
    reasons: person.review_reasons,
    relations: relationCounts.get(person.slug) ?? 0,
    exactCredits: exactCreditCounts.get(person.slug) ?? 0,
    sources: person.source_ids.length,
    portrait: Boolean(person.portrait),
  };
}

export function getAdminPersonResearchOverview(input?: {
  query?: string;
  filter?: PersonAdminFilter;
  page?: number;
  pageSize?: number;
}): PersonAdminOverview {
  const query = input?.query?.trim() ?? "";
  const normalizedQuery = normalize(query);
  const filter = input?.filter ?? "all";
  const pageSize = Math.min(100, Math.max(20, input?.pageSize ?? 50));
  const allRecords = people
    .map(toAdminRecord)
    .filter((record) => matchesFilter(record, filter))
    .filter((record) => {
      if (!normalizedQuery) return true;
      return normalize([
        record.name,
        record.slug,
        record.qid,
        record.origin ?? "",
        ...record.occupations,
        ...record.reasons,
      ].join(" ")).includes(normalizedQuery);
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
  };
}
