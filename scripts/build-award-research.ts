import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { buildAwardPublicData } from "../src/lib/award-domain";
import type { AwardResearchData } from "../src/lib/award-research-types";
import { getCatalogWorkKey } from "../src/lib/catalog-work";

const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const root = "data/research/award-study/";
const sourceFile = root + "research.json";
const research: AwardResearchData = read(sourceFile);
const approvals = read("data/research/award-editorial-approvals.json") as { researchHash: string | null; approved: string[] };
const researchHash = createHash("sha256").update(readFileSync(sourceFile)).digest("hex");
if (approvals.approved.length && approvals.researchHash !== researchHash) throw new Error("Research changed since editorial approval");
if (new Set(approvals.approved).size !== approvals.approved.length) throw new Error("Duplicate approval");
const kinds = { series: research.series, edition: research.editions, category: research.categories, result: research.results, work: research.workLinks, personWork: research.personWorkLinks, companyWork: research.companyWorkLinks };
const known = new Set(Object.entries(kinds).flatMap(([kind, rows]) => rows.map(row => `${kind}:${row.id}`)));
for (const key of approvals.approved) if (!known.has(key)) throw new Error(`Unresolved approval ${key}`);
const people = read("data/research/person-study/public.json");
const legacy = read("data/research/person-study/awards.json").records;
const catalog = read("data/catalog.json") as { id: string }[];
const { publicData, review } = buildAwardPublicData(research, {
  approved: new Set(approvals.approved),
  catalogWorkKeys: new Map(catalog.map(g => [g.id, getCatalogWorkKey(g.id)])),
  publicPeople: new Map(people.profiles.map((p: {slug: string; qid: string}) => [p.slug, p.qid])),
  companies: new Set(Object.keys(read("data/index/companies.json"))),
  exactCredits: new Map(people.exactCredits.map((c: {id: string}) => [c.id, c])),
  legacyAwards: new Map(legacy.map((a: {award_id: string; person_slug: string}) => [a.award_id, { personSlug: a.person_slug }])),
});
const manifest = {
  version: 1, generatedAt: research.reviewedAt, researchHash,
  counts: { series: publicData.series.length, editions: publicData.editions.length, categories: publicData.categories.length, publishedResults: publicData.results.length, internalResults: research.results.length - publicData.results.length,
    gameRecipients: publicData.results.flatMap(r => r.recipients).filter(r => r.type === "game").length,
    personRecipients: publicData.results.flatMap(r => r.recipients).filter(r => r.type === "person").length,
    companyRecipients: publicData.results.flatMap(r => r.recipients).filter(r => r.type === "company").length,
    workLinks: publicData.workLinks.length, personWorkLinks: publicData.personWorkLinks.length, sources: publicData.sources.length, unresolved: review.length },
  policies: { publicImportsOnlyPublicJson: true, gameAwardIsPersonalAward: false, automaticPersonMergeAllowed: false, automaticCompanyInheritanceAllowed: false, fuzzyWorkMatchCanPublish: false, wikidataOnlyMajorAwardCanPublish: false },
};
const outputs = { "public.json": publicData, "manifest.json": manifest, "review.json": { version: 1, records: review } };
if (process.argv.includes("--check") === process.argv.includes("--write")) throw new Error("Choose exactly one of --check or --write");
// Validate and serialize every output before writing any generated artifact.
const encoded = Object.entries(outputs).map(([name, data]) => [root + name, JSON.stringify(data, null, 2) + "\n"] as const);
for (const [file, text] of encoded) {
  if (process.argv.includes("--write")) writeFileSync(file, text);
  else if (readFileSync(file, "utf8") !== text) throw new Error(`Non-reproducible award output: ${file}`);
}
console.log(JSON.stringify(manifest.counts));
