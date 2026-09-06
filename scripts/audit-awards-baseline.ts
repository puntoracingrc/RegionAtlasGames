import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { getCatalogWorkKey } from "../src/lib/catalog-work";
import { catalogGamePath } from "../src/lib/catalog-url";

const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const digest = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const catalog = read("data/catalog.json") as { id: string; title: string; slug: string; platformSlug: string; region: string }[];
const core = read("data/research/person-study/core.json").records as { slug: string; name: string; qid: string; visibility: string; source_ids: string[] }[];
const people = read("data/research/person-study/public.json");
const works = read("data/research/person-study/works.json").records;
const awards = read("data/research/person-study/awards.json").records;
const priorities = ["hidetaka-miyazaki", "hideo-kojima", "swen-vincke", "sam-lake", "neil-druckmann", "todd-howard", "josef-fares", "guillaume-broche", "eric-barone", "naoki-yoshida", "shigeru-miyamoto"];
const titles = ["It Takes Two", "Elden Ring", "Baldur's Gate 3", "Astro Bot", "Clair Obscur: Expedition 33", "Hades", "Returnal", "Vampire Survivors", "Inscryption", "Balatro", "Resident Evil Village", "Black Myth: Wukong", "Ghost of Tsushima", "Monster Hunter Rise", "Monster Hunter Rise: Sunbreak", "The Legend of Zelda: Tears of the Kingdom", "Metaphor: ReFantazio", "Umurangi Generation", "Betrayal at Club Low", "Venba", "Consume Me", "Titanium Court"];
const protectedFiles = ["data/catalog.json", "data/meta.json", "data/game-details.json", "data/index/companies.json", "data/index/company-entities.json", "data/index/catalog-work-identities.json", "data/research/person-study/public.json", "data/research/person-study/manifest.json", "data/research/person-editorial-approvals.json", "data/research/company-study/public.json"];
// Title matching only generates review candidates; this report is never a publication input.
const normalize = (text: string) => text.toLowerCase().replace(/&#(?:39|x27);/g, "'").replace(/&amp;/g, "&").replace(/[^a-z0-9]/g, "");
const candidateTitles = (title: string) => title === "Baldur's Gate 3" ? [title, "Baldur's Gate III"] : [title];
const matches = (gameTitle: string, title: string) => candidateTitles(title).some(t => normalize(gameTitle).includes(normalize(t)));
const companyIndex = read("data/index/companies.json") as Record<string, { name?: string; asDeveloper?: string[]; asPublisher?: string[] }>;
const candidateIds = new Set(catalog.filter(g => titles.some(title => matches(g.title, title))).map(g => g.id));
const roles = new Map<string, { slug: string; role: string }[]>();
for (const [slug, company] of Object.entries(companyIndex)) {
  for (const [key, role] of [["asDeveloper", "developer"], ["asPublisher", "publisher"]] as const) {
    for (const id of company[key] ?? []) if (candidateIds.has(id)) roles.set(id, [...(roles.get(id) ?? []), { slug, role }]);
  }
}
const report = {
  schemaVersion: 1,
  scope: "AWARDS-PERSONS-V1 baseline; candidates only, no publication or identity changes",
  baseSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  protectedFileHashes: Object.fromEntries(protectedFiles.map(f => [f, digest(f)])),
  catalog: { rows: catalog.length, uniqueIds: new Set(catalog.map(g => g.id)).size, companies: Object.keys(companyIndex).length, idsHash: createHash("sha256").update(JSON.stringify(catalog.map(g => g.id).sort())).digest("hex"), urlsHash: createHash("sha256").update(JSON.stringify(catalog.map(g => catalogGamePath(g as Parameters<typeof catalogGamePath>[0])).sort())).digest("hex") },
  people: { total: core.length, public: people.profiles.length, publicExactCredits: people.exactCredits.length, existingAwards: awards.length, publicAwards: people.awards.length },
  priorityPeople: priorities.map(slug => {
    const person = core.find(p => p.slug === slug);
    return { requestedSlug: slug, identity: person ? { name: person.name, slug: person.slug, qid: person.qid, visibility: person.visibility } : null,
      exactCredits: works.filter((w: {person_slug: string; relationship_precision: string}) => w.person_slug === slug && w.relationship_precision === "EXACT_EDITORIAL_CREDIT"),
      awards: awards.filter((a: {person_slug: string}) => a.person_slug === slug),
      action: !person ? "SEARCH_AND_REVIEW_IDENTITY_NO_AUTO_CREATE" : person.visibility === "published" ? "ENRICH_EXISTING_NO_CREATE" : "INTERNAL_ONLY_NO_PROMOTION" };
  }),
  workCandidates: titles.map(title => ({ title, publicationAllowed: false, candidates: catalog.filter(g => matches(g.title, title)).map(g => ({ id: g.id, title: g.title, platform: g.platformSlug, region: g.region, workKey: getCatalogWorkKey(g.id), companies: roles.get(g.id) ?? [], status: "REQUIRES_EXPLICIT_IDENTITY_REVIEW" })) })),
  legacyAwards: awards.map((award: {award_id: string; publication_status: string; source_url: string; requires_review: boolean}) => ({ id: award.award_id, existingVisibility: award.publication_status, proposedClassification: award.publication_status === "published" ? "GENERAL_RECOGNITION" : "NEEDS_REVIEW", sourceUrl: award.source_url, formalResultId: null })),
};
const output = "docs/research/awards-persons-v1/baseline.json";
const serialized = JSON.stringify(report, null, 2) + "\n";
if (process.argv.includes("--write")) { mkdirSync("docs/research/awards-persons-v1", { recursive: true }); writeFileSync(output, serialized); }
else if (process.argv.includes("--check")) {
  const stored = read(output);
  // The baseline SHA is historical evidence, not a constraint on future commits.
  report.baseSha = stored.baseSha;
  if (JSON.stringify(stored) !== JSON.stringify(report)) throw new Error("Awards baseline changed; review the data diff before refreshing it");
}
console.log(JSON.stringify({ catalog: report.catalog, people: report.people, priorities: report.priorityPeople.map(p => ({ slug: p.requestedSlug, visibility: p.identity?.visibility ?? "absent", credits: p.exactCredits.length, awards: p.awards.length })), candidates: report.workCandidates.map(w => ({ title: w.title, count: w.candidates.length, workKeys: new Set(w.candidates.map(c => c.workKey)).size })) }, null, 2));
