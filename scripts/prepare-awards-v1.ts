import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import type { AwardResearchData, AwardPrestigeGroup, AwardCategoryType, AwardResultType, AwardEditionStatus } from "../src/lib/award-research-types";
import { getCatalogWorkKey } from "../src/lib/catalog-work";

// This is a closed, manually reviewed batch, not a discovery or title-matching importer.
const root = "data/research/award-study/";
const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const encode = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
type WorkDecision = { title: string; ids: string[]; url: string; note: string };
type PersonalDecision = { series: string; year: number; category: string; categoryName: string; slug: string; name: string; qid: string; url: string; legacyIds: string[] };
type CreditDecision = { title: string; personWorkId: string; url: string; note: string };
type CompanyDecision = { title: string; companySlug: string; role: "developer" | "publisher"; catalogId: string; url: string; note: string };
const seed = read(root + "backfill-v1.json") as {
  batch: string; reviewedAt: string;
  series: [string,string,string,string,string,string,string,AwardPrestigeGroup,string][];
  results: [string,number,string,string,boolean?,string?,string?][];
  workDecisions: WorkDecision[]; personalResults: PersonalDecision[];
  personWorkDecisions: CreditDecision[]; companyWorkDecisions: CompanyDecision[];
  pending: { key: string; status: string; reason: string }[];
  legacyPersonalResults: [string,string,number,string,string,string][];
  otherResults: [string,number,string,string,string,AwardCategoryType,AwardResultType,string][];
  generalLegacyIds: string[];
};
assert.equal(seed.batch, "AWARDS-PERSONS-V1");
assert.ok(process.argv.includes("--write") !== process.argv.includes("--check"), "Choose --write or --check");
const catalog = read("data/catalog.json") as {id: string; title: string}[];
const ids = new Set(catalog.map(g => g.id));
assert.equal(ids.size, catalog.length);
const identityFile = "data/index/catalog-work-identities.json";
const identities = read(identityFile) as { catalogIdToWorkKey: Record<string,string> };
const research: AwardResearchData = { version: 1, reviewedAt: seed.reviewedAt, series: [], editions: [], categories: [], results: [], workLinks: [], personWorkLinks: [], companyWorkLinks: [], legacyLinks: [], sources: [] };
const approved = new Set<string>();
const approve = (kind: string, id: string) => approved.add(`${kind}:${id}`);
const source = (url: string, title: string, summary: string) => {
  const id = "AW-SRC-" + createHash("sha256").update(url).digest("hex").slice(0,12);
  const existing = research.sources.find(s => s.id === id);
  if (!existing) research.sources.push({ id, url, title, retrievedAt: seed.reviewedAt, verifiedPrimary: true, evidenceSummary: summary });
  else if (!existing.evidenceSummary.includes(summary)) existing.evidenceSummary += ` ${summary}`;
  return id;
};
const keys = new Map<string,string>();
const identityAudit: {catalogId:string;title:string;workKey:string;sourceId:string;note:string}[] = [];
for (const decision of seed.workDecisions) {
  assert.ok(decision.ids.length);
  assert.ok(!keys.has(decision.title), `Repeated work decision ${decision.title}`);
  const key = getCatalogWorkKey(decision.ids[0]);
  const sourceId = source(decision.url, `Identidad de obra: ${decision.title}`, decision.note);
  for (const id of decision.ids) {
    assert.ok(ids.has(id), `Missing catalog ID ${id}`);
    assert.ok(!identities.catalogIdToWorkKey[id] || identities.catalogIdToWorkKey[id] === key, `Conflicting existing identity ${id}`);
    identities.catalogIdToWorkKey[id] = key;
    identityAudit.push({ catalogId: id, title: catalog.find(g => g.id === id)!.title, workKey: key, sourceId, note: decision.note });
  }
  keys.set(decision.title, key);
  const id = `AW-WORK-${decision.ids[0]}`;
  research.workLinks.push({ id, workKey: key, displayName: decision.title, catalogIdsVerified: decision.ids, sourceIds: [sourceId], verificationStatus: "VERIFIED" });
  approve("work", id);
}
for (const [slug,name,shortName,organizer,url,categoryName,categorySlug,prestige,description] of seed.series) {
  const sourceId = source(url, `${name}: archivo oficial`, `Organización y archivo de ${name}.`);
  research.series.push({ id: slug, slug, canonicalName: name, shortName, organizer, officialUrl: url, foundedYear: null, scope: null, descriptionEs: description, selectionModel: null, specialization: null, active: true, sourceIds: [sourceId] });
  research.categories.push({ id: `${slug}:${categorySlug}`, seriesSlug: slug, slug: categorySlug, canonicalName: categoryName, displayName: categoryName, categoryType: "top_game", prestigeGroup: prestige, activeFrom: null, activeTo: null, previousNames: [], successorCategoryId: null, sourceIds: [sourceId] });
  approve("series", slug); approve("category", `${slug}:${categorySlug}`);
}
const metadata = read(root + "series-metadata.json") as {
  series: {slug:string;foundedYear:number;scope:string;selectionModel:string;specialization:string;url:string}[];
  editions: {seriesSlug:string;year:number;date:string;status:AwardEditionStatus;venue:string|null;city:string|null;url:string}[];
};
for (const {slug,url,...fields} of metadata.series) {
  const row = research.series.find(s => s.slug === slug); assert.ok(row, slug);
  Object.assign(row, fields);
  row.sourceIds = [...new Set([...row.sourceIds,source(url, `${row.canonicalName}: selección`, fields.selectionModel)])];
}
function edition(seriesSlug: string, year: number, sourceId: string, url: string) {
  const id = `${seriesSlug}:${year}`;
  if (!research.editions.some(e => e.id === id)) research.editions.push({ id, seriesSlug, editionYear: year, editionNumber: null, ceremonyDate: null, eligibilityPeriod: null, venue: null, city: null, status: "completed", officialUrl: url, sourceIds: [sourceId] });
  const row = research.editions.find(e => e.id === id)!;
  row.sourceIds = [...new Set([...row.sourceIds,sourceId])];
  approve("edition", id); return id;
}
const historical = readdirSync(root).filter(name => /^history-[a-z-]+\.json$/.test(name)).sort().flatMap(name => read(root + name)) as typeof seed.results;
for (const [seriesSlug,year,title,url,shared = false,officialLabel = null,categoryOverride] of [...seed.results, ...historical]) {
  const series = research.series.find(s => s.slug === seriesSlug)!; assert.ok(series);
  const sourceId = source(url, `${series.shortName} ${year}: resultados oficiales`, `El archivo identifica ${title} como ganador del máximo premio de ${year}.`);
  const editionId = edition(seriesSlug, year, sourceId, url);
  const topCategory = research.categories.find(c => c.seriesSlug === seriesSlug && c.categoryType === "top_game")!;
  const categoryId = categoryOverride ? `${seriesSlug}:${categoryOverride}` : topCategory.id;
  if (categoryOverride && !research.categories.some(c => c.id === categoryId)) {
    assert.ok(officialLabel, "Historical category needs its official name");
    research.categories.push({...topCategory, id: categoryId, slug: categoryOverride, canonicalName: officialLabel, displayName: officialLabel, activeFrom: year, activeTo: year, sourceIds: [sourceId]});
    approve("category", categoryId);
  } else if (categoryOverride) {
    research.categories.find(c => c.id === categoryId)!.activeTo = year;
  }
  const id = `${editionId}:${createHash("sha256").update(title).digest("hex").slice(0,10)}`;
  research.results.push({ id, editionId, seriesSlug, categoryId, resultType: "winner", officialLabel, shared, recipients: [{ type: "game", workKey: keys.get(title) ?? null, displayName: title }], sourceIds: [sourceId], confidence: "HIGH", verificationStatus: "VERIFIED", publicationStatus: "published" });
  approve("result", id);
}
const people = read("data/research/person-study/public.json") as {profiles:{slug:string;name:string;qid:string}[];awards:{id:string;personSlug:string}[]};
const legacyPersonal = seed.legacyPersonalResults.map(([legacyId,series,year,category,categoryName,url]) => {
  const award = people.awards.find(a => a.id === legacyId); assert.ok(award, legacyId);
  const person = people.profiles.find(p => p.slug === award.personSlug); assert.ok(person, legacyId);
  return {series,year,category,categoryName,url,slug:person.slug,name:person.name,qid:person.qid,legacyIds:[legacyId]};
});
for (const row of [...seed.personalResults, ...legacyPersonal]) {
  const sourceId = source(row.url, `${row.name}: ${row.categoryName} ${row.year}`, `La organización identifica a ${row.name}, no a una obra, como receptor.`);
  const editionId = edition(row.series, row.year, sourceId, row.url);
  const categoryId = `${row.series}:${row.category}`;
  if (!research.categories.some(c => c.id === categoryId)) research.categories.push({ id: categoryId, seriesSlug: row.series, slug: row.category, canonicalName: row.categoryName, displayName: row.categoryName, categoryType: row.category === "hall-of-fame" ? "hall_of_fame" : "career", prestigeGroup: "major_personal", activeFrom: null, activeTo: null, previousNames: [], successorCategoryId: null, sourceIds: [sourceId] });
  const id = `${editionId}:${row.category}:${row.slug}`;
  research.results.push({ id, editionId, seriesSlug: row.series, categoryId, resultType: "recipient", officialLabel: null, shared: false, recipients: [{type:"person",personSlug:row.slug,personQid:row.qid,displayName:row.name}], sourceIds:[sourceId],confidence:"HIGH",verificationStatus:"VERIFIED",publicationStatus:"published" });
  approve("category", categoryId); approve("result", id);
  for (const legacyAwardId of row.legacyIds) research.legacyLinks.push({id:`AW-LEGACY-${legacyAwardId}`,legacyAwardId,classification:"FORMAL_AWARD_LINKED",resultId:id});
}
for (const [seriesSlug,year,title,categorySlug,categoryName,categoryType,resultType,url] of seed.otherResults) {
  const sourceId = source(url, `${seriesSlug} ${year}: ${categoryName}`, `${title}: ${resultType} en ${categoryName}, ${year}.`);
  const editionId = edition(seriesSlug,year,sourceId,url);
  const categoryId = `${seriesSlug}:${categorySlug}`;
  if (!research.categories.some(c => c.id === categoryId)) research.categories.push({id:categoryId,seriesSlug,slug:categorySlug,canonicalName:categoryName,displayName:categoryName,categoryType,prestigeGroup:"category_award",activeFrom:null,activeTo:null,previousNames:[],successorCategoryId:null,sourceIds:[sourceId]});
  const id = `${editionId}:${categorySlug}:${createHash("sha256").update(title).digest("hex").slice(0,10)}`;
  research.results.push({id,editionId,seriesSlug,categoryId,resultType,officialLabel:null,shared:false,recipients:[{type:"game",workKey:keys.get(title) ?? null,displayName:title}],sourceIds:[sourceId],confidence:"HIGH",verificationStatus:"VERIFIED",publicationStatus:"published"});
  approve("category",categoryId); approve("result",id);
}
for (const row of metadata.editions) {
  const sourceId = source(row.url, `${row.seriesSlug} ${row.year}: ceremonia`, `Ceremonia documentada: ${row.date}.`);
  const id = edition(row.seriesSlug,row.year,sourceId,row.url);
  const item = research.editions.find(e => e.id === id)!;
  Object.assign(item,{ceremonyDate:row.date,status:row.status,venue:row.venue,city:row.city});
  item.sourceIds = [...new Set([...item.sourceIds,sourceId])];
}
const legacyAwards = read("data/research/person-study/awards.json").records as {award_id:string}[];
for (const row of legacyAwards) {
  if (research.legacyLinks.some(l => l.legacyAwardId === row.award_id)) continue;
  research.legacyLinks.push({id:`AW-LEGACY-${row.award_id}`,legacyAwardId:row.award_id,classification:seed.generalLegacyIds.includes(row.award_id) ? "GENERAL_RECOGNITION" : "NEEDS_REVIEW",resultId:null});
}
for (const row of seed.personWorkDecisions) {
  const workKey = keys.get(row.title); assert.ok(workKey, row.title);
  const id = `AW-PW-${row.personWorkId}`;
  research.personWorkLinks.push({ id, personWorkId: row.personWorkId, catalogWorkKey: workKey, sourceIds:[source(row.url,`Crédito exacto: ${row.title}`,row.note)],verificationStatus:"VERIFIED" });
  approve("personWork",id);
}
for (const row of seed.companyWorkDecisions) {
  const workKey = keys.get(row.title); assert.ok(workKey,row.title);
  assert.ok(research.workLinks.some(w=>w.workKey===workKey && w.catalogIdsVerified.includes(row.catalogId)));
  const id = `AW-CW-${row.companySlug}-${row.role}-${row.catalogId}`;
  research.companyWorkLinks.push({id,companySlug:row.companySlug,workKey,role:row.role,catalogId:row.catalogId,sourceIds:[source(row.url,`Crédito ${row.role}: ${row.title}`,row.note)],verificationStatus:"VERIFIED"});
  approve("companyWork",id);
}
const text = encode(research);
// A closed batch may extend history, never silently discard later editorial work.
const previous = read(root + "research.json") as AwardResearchData;
for (const old of previous.results) {
  const next = research.results.find(r => r.id === old.id);
  assert.ok(next, `Refusing to remove historical result ${old.id}`);
  assert.deepEqual(next, old, `Historical result changed; requires a separate reviewed correction: ${old.id}`);
}
const outputs: [string,string][] = [
  [identityFile,encode(identities)], [root+"research.json",text],
  ["data/research/award-editorial-approvals.json",encode({researchHash:createHash("sha256").update(text).digest("hex"),approved:[...approved].sort()})],
  [root+"identity-decisions.json",encode({batch:seed.batch,reviewedAt:seed.reviewedAt,records:identityAudit})],
  [root+"backfill-review.json",encode({batch:seed.batch,records:[...seed.pending,...research.results.flatMap(r=>r.recipients.filter(p=>p.type==="game" && p.workKey===null).map(p=>({key:r.id,status:"NEEDS_REVIEW",reason:`Identidad de catálogo pendiente: ${p.displayName}. Resultado oficial publicado sin propagar.`})))]})],
];
for (const [file,content] of outputs) {
  if (process.argv.includes("--write")) writeFileSync(file,content);
  else assert.equal(readFileSync(file,"utf8"),content,`Non-reproducible batch ${file}`);
}
console.log(JSON.stringify({results:research.results.length,works:research.workLinks.length,identities:identityAudit.length,approved:approved.size}));
