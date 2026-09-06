import data from "../../data/research/award-study/public.json";
import { isWinningAwardResult } from "./award-domain";
import { getAwardTemporalState, pendingAwardEditions } from "./award-calendar";
import type { AwardPublicData, AwardPublicResult } from "./award-research-types";

export function createAwardQueries(awards: AwardPublicData) {
  const results = awards.results;
  const forWork = (workKey: string) => results.filter(r => r.recipients.some(p => p.type === "game" && p.workKey === workKey));
  const forCompanyRole = (companySlug: string, role: "developer" | "publisher") => {
    const keys = new Set(awards.companyWorkLinks.filter(l => l.companySlug === companySlug && l.role === role).map(l => l.workKey));
    return [...keys].flatMap(workKey => forWork(workKey).map(result => ({ workKey, result })));
  };
  const getSeries = (seriesSlug: string) => awards.series.find(s => s.slug === seriesSlug);
  const getEdition = (seriesSlug: string, year: number) => awards.editions.find(e => e.seriesSlug === seriesSlug && e.editionYear === year);
  const getCategory = (seriesSlug: string, categorySlug: string) => awards.categories.find(c => c.seriesSlug === seriesSlug && c.slug === categorySlug);
  const forPersonWorks = (personSlug: string) => {
    const links = awards.personWorkLinks.filter(l => l.personSlug === personSlug);
    return [...new Set(links.map(l => l.workKey))].map(workKey => {
      const credits = links.filter(l => l.workKey === workKey);
      const roles = [...new Set(credits.map(l => l.role))];
      return { workKey, personSlug, roles, role: roles.join(" / "), personWorkIds: credits.map(l => l.personWorkId), sourceIds: [...new Set(credits.flatMap(l => l.sourceIds))], results: forWork(workKey) };
    }).filter(l => l.results.length);
  };
  const winnerStats = (rows: AwardPublicResult[]) => {
    const unique = [...new Map(rows.map(r => [r.id, r])).values()];
    const wins = unique.filter(isWinningAwardResult);
    const major = wins.filter(r => awards.categories.some(c => c.id === r.categoryId && c.categoryType === "top_game" && c.prestigeGroup === "major_global"));
    return { wins: wins.length, nominations: unique.filter(r => r.resultType === "nominee" || r.resultType === "finalist").length, majorTopAwardCount: major.length, majorTopAwardOrganizationCount: new Set(major.map(r => r.seriesSlug)).size };
  };
  return {
    getAwardWork: (workKey: string) => awards.workLinks.find(w => w.workKey === workKey),
    getAwardSources: (ids: string[]) => awards.sources.filter(s => ids.includes(s.id)),
    getAwardResultContext: (result: AwardPublicResult) => ({ series: getSeries(result.seriesSlug)!, edition: awards.editions.find(e => e.id === result.editionId)!, category: awards.categories.find(c => c.id === result.categoryId)! }),
    getLinkedLegacyAwardIds: () => new Set(awards.legacyLinks.map(l => l.legacyAwardId)),
    getPublicAwardSeries: () => awards.series,
    getUpcomingAwardEditions: (today: string) => awards.editions.filter(e => getAwardTemporalState(e, today) === "future").sort((a,b) => a.ceremonyDate!.localeCompare(b.ceremonyDate!)),
    getPendingAwardEditions: (today: string) => pendingAwardEditions(awards.editions, today),
    getPublicAwardSeriesSlugs: () => awards.series.map(s => s.slug),
    getAwardSeriesView: (seriesSlug: string) => getSeries(seriesSlug) ? { series: getSeries(seriesSlug)!, editions: awards.editions.filter(e => e.seriesSlug === seriesSlug), categories: awards.categories.filter(c => c.seriesSlug === seriesSlug), results: results.filter(r => r.seriesSlug === seriesSlug) } : undefined,
    getAwardEditionView: (seriesSlug: string, year: number) => { const edition = getEdition(seriesSlug, year); return edition ? { edition, results: results.filter(r => r.editionId === edition.id) } : undefined; },
    getAwardCategoryHistory: (seriesSlug: string, categorySlug: string) => { const category = getCategory(seriesSlug, categorySlug); return category ? { category, results: results.filter(r => r.categoryId === category.id) } : undefined; },
    getAwardsForWorkKey: forWork,
    getDirectAwardsForPerson: (personSlug: string) => results.filter(r => r.recipients.some(p => p.type === "person" && p.personSlug === personSlug)),
    getWorkAwardsForPerson: forPersonWorks,
    getDirectAwardsForCompany: (companySlug: string) => results.filter(r => r.recipients.some(p => p.type === "company" && p.companySlug === companySlug)),
    getDevelopedGameAwardsForCompany: (companySlug: string) => forCompanyRole(companySlug, "developer"),
    getPublishedGameAwardsForCompany: (companySlug: string) => forCompanyRole(companySlug, "publisher"),
    getLatestAwardWinners: () => results.filter(isWinningAwardResult).sort((a, b) => (awards.editions.find(e => e.id === b.editionId)?.editionYear ?? 0) - (awards.editions.find(e => e.id === a.editionId)?.editionYear ?? 0) || a.id.localeCompare(b.id)),
    getAwardSitemapEntries: () => awards.series.length ? ["/premios", "/premios/ultimos-ganadores", ...awards.series.map(s => `/premios/${s.slug}`), ...awards.editions.map(e => `/premios/${e.seriesSlug}/${e.editionYear}`), ...awards.categories.filter(c => results.some(r => r.categoryId === c.id)).map(c => `/premios/${c.seriesSlug}/categoria/${c.slug}`)] : [],
    getAwardStats: winnerStats,
  };
}
export const {
  getPublicAwardSeries, getPublicAwardSeriesSlugs, getAwardSeriesView, getAwardEditionView,
  getAwardCategoryHistory, getAwardsForWorkKey, getDirectAwardsForPerson, getWorkAwardsForPerson,
  getDirectAwardsForCompany, getDevelopedGameAwardsForCompany, getPublishedGameAwardsForCompany,
  getLatestAwardWinners, getAwardSitemapEntries, getAwardStats,
  getAwardWork, getAwardSources, getAwardResultContext, getLinkedLegacyAwardIds,
  getUpcomingAwardEditions, getPendingAwardEditions,
} = createAwardQueries(data as AwardPublicData);
