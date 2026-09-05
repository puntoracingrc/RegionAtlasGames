import type { AwardPublicData, AwardPublicResult, AwardResearchData, AwardResultType } from "./award-research-types";

export type AwardBuildContext = {
  approved: Set<string>;
  catalogWorkKeys: Map<string, string>;
  publicPeople: Map<string, string>;
  companies: Set<string>;
  exactCredits: Map<string, { personSlug: string; role: string; sourceId: string; relationshipPrecision: string }>;
  legacyAwards: Map<string, { personSlug: string }>;
};
export const isWinningAwardResult = (r: { resultType: AwardResultType }) => ["winner", "recipient", "special_recognition"].includes(r.resultType);
const requireValue = (value: unknown, message: string): void => { if (!value) throw new Error(message); };
const unique = (values: string[], label: string) => requireValue(values.every(Boolean) && new Set(values).size === values.length, `Duplicate or empty ${label}`);
const slug = (value: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

/** Pure build boundary: no filesystem, network, identity inference or mutation. */
export function buildAwardPublicData(data: AwardResearchData, context: AwardBuildContext) {
  requireValue(data.version === 1 && /^\d{4}-\d{2}-\d{2}$/.test(data.reviewedAt), "Invalid research version/date");
  // Reject unknown fields at the export boundary, including accidental internal notes.
  const allowed = {
    series: "id slug canonicalName shortName organizer foundedYear scope officialUrl descriptionEs selectionModel specialization active sourceIds",
    editions: "id seriesSlug editionYear editionNumber ceremonyDate eligibilityPeriod venue city status officialUrl sourceIds",
    categories: "id seriesSlug slug canonicalName displayName categoryType prestigeGroup activeFrom activeTo previousNames successorCategoryId sourceIds",
    results: "id editionId seriesSlug categoryId resultType officialLabel shared recipients sourceIds confidence verificationStatus publicationStatus",
    workLinks: "id workKey displayName catalogIdsVerified sourceIds verificationStatus",
    personWorkLinks: "id personWorkId catalogWorkKey sourceIds verificationStatus",
    companyWorkLinks: "id companySlug workKey role catalogId sourceIds verificationStatus",
    legacyLinks: "id legacyAwardId classification resultId",
    sources: "id url title retrievedAt verifiedPrimary evidenceSummary",
  };
  for (const key of Object.keys(allowed) as (keyof typeof allowed)[]) {
    const fields = new Set(allowed[key].split(" "));
    for (const row of data[key]) requireValue(Object.keys(row).every(f => fields.has(f)), `Unexpected private field in ${key}`);
  }
  for (const key of ["series", "editions", "categories", "results", "workLinks", "personWorkLinks", "companyWorkLinks", "legacyLinks", "sources"] as const) unique(data[key].map(r => r.id), key);
  unique(data.series.map(s => s.slug), "series slug");
  unique(data.editions.map(e => `${e.seriesSlug}:${e.editionYear}`), "edition year");
  unique(data.categories.map(c => `${c.seriesSlug}:${c.slug}`), "category slug");
  unique(data.workLinks.map(w => w.workKey), "work link key");
  unique(data.personWorkLinks.map(w => `${w.personWorkId}:${w.catalogWorkKey}`), "person work pair");
  unique(data.companyWorkLinks.map(w => `${w.companySlug}:${w.role}:${w.workKey}`), "company work role");
  unique(data.legacyLinks.map(l => l.legacyAwardId), "legacy award link");
  const series = new Map(data.series.map(s => [s.slug, s]));
  const editions = new Map(data.editions.map(e => [e.id, e]));
  const categories = new Map(data.categories.map(c => [c.id, c]));
  const sources = new Map(data.sources.map(s => [s.id, s]));
  const results = new Map(data.results.map(r => [r.id, r]));
  const works = new Map(data.workLinks.map(w => [w.workKey, w]));
  const resultFacts = new Set<string>();
  const evidence = (ids: string[]) => {
    requireValue(ids.length > 0 && new Set(ids).size === ids.length, "Missing or duplicate evidence");
    for (const id of ids) requireValue(sources.has(id), `Unknown source ${id}`);
  };
  for (const source of data.sources) {
    requireValue(/^https?:\/\//.test(source.url) && source.title.trim() && source.evidenceSummary.trim() && source.retrievedAt && typeof source.verifiedPrimary === "boolean", `Invalid source ${source.id}`);
  }
  for (const s of data.series) { requireValue(slug(s.slug) && /^https?:\/\//.test(s.officialUrl), `Invalid series ${s.id}`); evidence(s.sourceIds); }
  for (const e of data.editions) { requireValue(series.has(e.seriesSlug) && Number.isInteger(e.editionYear) && ["upcoming", "nominations_announced", "voting_open", "ceremony_in_progress", "completed", "corrected"].includes(e.status), `Invalid edition ${e.id}`); evidence(e.sourceIds); }
  for (const c of data.categories) {
    requireValue(series.has(c.seriesSlug) && slug(c.slug), `Invalid category ${c.id}`); evidence(c.sourceIds);
    if (c.successorCategoryId) requireValue(categories.get(c.successorCategoryId)?.seriesSlug === c.seriesSlug && c.successorCategoryId !== c.id, `Invalid category successor ${c.id}`);
  }
  for (const w of data.workLinks) {
    evidence(w.sourceIds);
    requireValue(w.catalogIdsVerified.length > 0, `Empty work identity ${w.id}`);
    unique(w.catalogIdsVerified, "catalog IDs in work link");
    for (const id of w.catalogIdsVerified) requireValue(context.catalogWorkKeys.get(id) === w.workKey, `Unresolved work identity ${id}`);
  }
  for (const link of data.personWorkLinks) { evidence(link.sourceIds); requireValue(works.has(link.catalogWorkKey), `Unknown linked work ${link.id}`); }
  for (const link of data.companyWorkLinks) {
    evidence(link.sourceIds);
    requireValue(context.companies.has(link.companySlug) && ["developer", "publisher"].includes(link.role) && context.catalogWorkKeys.get(link.catalogId) === link.workKey && works.has(link.workKey), `Invalid company work credit ${link.id}`);
  }
  for (const r of data.results) {
    requireValue(["HIGH", "MEDIUM", "LOW"].includes(r.confidence) && ["VERIFIED", "NEEDS_REVIEW"].includes(r.verificationStatus) && ["published", "internal"].includes(r.publicationStatus) && typeof r.shared === "boolean", `Invalid result state ${r.id}`);
    requireValue(series.has(r.seriesSlug) && editions.get(r.editionId)?.seriesSlug === r.seriesSlug && categories.get(r.categoryId)?.seriesSlug === r.seriesSlug, `Cross-series result ${r.id}`);
    requireValue(["winner", "nominee", "finalist", "honorable_mention", "recipient", "special_recognition"].includes(r.resultType), `Invalid result type ${r.id}`);
    evidence(r.sourceIds);
    requireValue(r.recipients.length > 0, `Missing recipient ${r.id}`);
    unique(r.recipients.map(p => p.type === "game" ? `game:${p.workKey}` : p.type === "person" ? `person:${p.personQid ?? p.personSlug ?? p.displayName}` : p.type === "company" ? `company:${p.companySlug ?? p.displayName}` : `${p.type}:${p.key}`), "recipients");
    for (const p of r.recipients) {
      const fields = p.type === "game" ? "type workKey displayName workQid" : p.type === "person" ? "type personSlug displayName personQid" : p.type === "company" ? "type companySlug displayName" : "type key displayName";
      requireValue(Object.keys(p).every(k => fields.split(" ").includes(k)), `Unexpected private recipient field ${r.id}`);
      requireValue(p.displayName.trim(), `Missing recipient name ${r.id}`);
      requireValue(["game", "person", "company", "team", "other"].includes(p.type), `Unknown recipient type ${r.id}`);
      if (p.type === "person" && p.personSlug) requireValue(context.publicPeople.has(p.personSlug) && (!p.personQid || context.publicPeople.get(p.personSlug) === p.personQid), `Non-public or mismatched person ${r.id}`);
      if (p.type === "company" && p.companySlug) requireValue(context.companies.has(p.companySlug), `Unknown company ${r.id}`);
      if (p.type === "game") requireValue(works.has(p.workKey), `Unaudited award work ${r.id}`);
      const identity = p.type === "game" ? p.workKey : p.type === "person" ? p.personQid ?? p.personSlug ?? p.displayName : p.type === "company" ? p.companySlug ?? p.displayName : p.key;
      const fact = `${r.editionId}:${r.categoryId}:${p.type}:${identity}`;
      requireValue(!resultFacts.has(fact), `Duplicate award fact ${r.id}`);
      resultFacts.add(fact);
    }
  }
  for (const l of data.legacyLinks) {
    requireValue(context.legacyAwards.has(l.legacyAwardId), `Unknown legacy award ${l.id}`);
    if (l.classification === "FORMAL_AWARD_LINKED") {
      const personSlug = context.legacyAwards.get(l.legacyAwardId)!.personSlug;
      requireValue(l.resultId && results.get(l.resultId)?.recipients.some(p => p.type === "person" && p.personSlug === personSlug), `Legacy award recipient mismatch ${l.id}`);
    } else requireValue(l.resultId === null, `Non-formal legacy link ${l.id}`);
  }
  const approved = (kind: string, id: string) => context.approved.has(`${kind}:${id}`);
  const publicSeries = data.series.filter(s => approved("series", s.id));
  const publicSeriesSlugs = new Set(publicSeries.map(s => s.slug));
  const publicEditions = data.editions.filter(e => approved("edition", e.id) && publicSeriesSlugs.has(e.seriesSlug));
  const publicCategories = data.categories.filter(c => approved("category", c.id) && publicSeriesSlugs.has(c.seriesSlug));
  const primaryEvidence = (ids: string[]) => ids.some(id => sources.get(id)?.verifiedPrimary === true && !new URL(sources.get(id)!.url).hostname.endsWith("wikidata.org"));
  for (const row of [...publicSeries, ...publicEditions, ...publicCategories]) requireValue(primaryEvidence(row.sourceIds), `Public award metadata lacks primary evidence ${row.id}`);
  const publicWorks = data.workLinks.filter(w => approved("work", w.id) && w.verificationStatus === "VERIFIED" && primaryEvidence(w.sourceIds));
  const workKeys = new Set(publicWorks.map(w => w.workKey));
  const review: { id: string; reason: string }[] = [];
  const publicResults: AwardPublicResult[] = [];
  for (const r of data.results) {
    const ready = approved("result", r.id) && r.publicationStatus === "published" && r.verificationStatus === "VERIFIED" && r.confidence === "HIGH" && primaryEvidence(r.sourceIds) && publicEditions.some(e => e.id === r.editionId) && publicCategories.some(c => c.id === r.categoryId) && r.recipients.every(p => p.type !== "game" || workKeys.has(p.workKey));
    if (!ready) { review.push({ id: r.id, reason: "Unapproved, unverified or unresolved publication dependency" }); continue; }
    const edition = editions.get(r.editionId)!;
    requireValue(!isWinningAwardResult(r) || ["completed", "corrected"].includes(edition.status), `Winner in unfinished edition ${r.id}`);
    publicResults.push({ id: r.id, editionId: r.editionId, seriesSlug: r.seriesSlug, categoryId: r.categoryId, resultType: r.resultType, officialLabel: r.officialLabel, shared: r.shared, recipients: r.recipients, sourceIds: r.sourceIds });
  }
  const personWorkLinks: AwardPublicData["personWorkLinks"] = [];
  for (const link of data.personWorkLinks) {
    const credit = context.exactCredits.get(link.personWorkId);
    if (approved("personWork", link.id) && link.verificationStatus === "VERIFIED" && workKeys.has(link.catalogWorkKey) && credit?.relationshipPrecision === "EXACT_EDITORIAL_CREDIT" && context.publicPeople.has(credit.personSlug) && primaryEvidence(link.sourceIds)) {
      personWorkLinks.push({ id: link.id, personWorkId: link.personWorkId, personSlug: credit.personSlug, workKey: link.catalogWorkKey, role: credit.role, sourceIds: link.sourceIds });
    } else review.push({ id: link.id, reason: "Missing approved public exact professional credit" });
  }
  const companyWorkLinks = data.companyWorkLinks.filter(l => approved("companyWork", l.id) && l.verificationStatus === "VERIFIED" && workKeys.has(l.workKey) && primaryEvidence(l.sourceIds)).map(l => ({ id: l.id, companySlug: l.companySlug, workKey: l.workKey, role: l.role, catalogId: l.catalogId, sourceIds: l.sourceIds }));
  const legacyLinks = data.legacyLinks.filter(l => l.classification === "FORMAL_AWARD_LINKED" && publicResults.some(r => r.id === l.resultId));
  const workLinks = publicWorks.map(w => ({ id: w.id, workKey: w.workKey, displayName: w.displayName, catalogIdsVerified: w.catalogIdsVerified, sourceIds: w.sourceIds }));
  const used = new Set([...publicSeries, ...publicEditions, ...publicCategories, ...publicResults, ...workLinks, ...personWorkLinks, ...companyWorkLinks].flatMap(r => r.sourceIds));
  const publicData: AwardPublicData = { version: 1, generatedAt: data.reviewedAt, series: publicSeries, editions: publicEditions, categories: publicCategories, results: publicResults, workLinks, personWorkLinks, companyWorkLinks, legacyLinks, sources: data.sources.filter(s => used.has(s.id)) };
  return { publicData, review };
}
