import { notFound } from "next/navigation";
import { AwardPageShell } from "@/components/award-page-shell";
import { AwardResultList } from "@/components/award-results";
import { getAwardCategoryHistory, getAwardSeriesView } from "@/lib/award-public-research";
import { awardMetadata } from "@/lib/award-seo";
import { isWinningAwardResult } from "@/lib/award-domain";
type Props = { params: Promise<{ award: string; category: string }> };
export async function generateMetadata({ params }: Props) {
  const { award, category } = await params; const view = getAwardCategoryHistory(award, category);
  return view?.results.length ? awardMetadata(`${view.category.displayName} · ${getAwardSeriesView(award)!.series.canonicalName}`, `/premios/${award}/categoria/${category}`, "Historial de resultados de la categoría y fuentes oficiales.") : {};
}
export default async function AwardCategoryPage({ params }: Props) {
  const { award, category } = await params; const view = getAwardCategoryHistory(award, category); if (!view?.results.length) notFound();
  const series = getAwardSeriesView(award)!.series;
  return <AwardPageShell title={view.category.displayName} description={series.canonicalName} breadcrumbs={[{ label: series.shortName ?? series.canonicalName, href: `/premios/${award}` }]}><AwardResultList results={view.results.filter(isWinningAwardResult).sort((a,b) => b.editionId.localeCompare(a.editionId))} /></AwardPageShell>;
}
