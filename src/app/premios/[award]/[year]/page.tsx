import { notFound } from "next/navigation";
import { AwardPageShell } from "@/components/award-page-shell";
import { AwardResultList } from "@/components/award-results";
import { getAwardEditionView, getAwardSeriesView, getAwardSources } from "@/lib/award-public-research";
import { awardMetadata } from "@/lib/award-seo";
type Props = { params: Promise<{ award: string; year: string }> };
const statuses = { completed: "Celebrada", corrected: "Resultados actualizados", upcoming: "Próxima edición", nominations_announced: "Nominaciones anunciadas", voting_open: "Votación abierta", ceremony_in_progress: "Ceremonia en curso" };
export async function generateMetadata({ params }: Props) {
  const { award, year } = await params; const view = /^\d{4}$/.test(year) && getAwardEditionView(award, Number(year));
  return view ? awardMetadata(`${getAwardSeriesView(award)!.series.canonicalName} ${year}`, `/premios/${award}/${year}`, "Ganadores, nominaciones y fuentes oficiales de esta edición.") : {};
}
export default async function AwardEditionPage({ params }: Props) {
  const { award, year } = await params; const view = /^\d{4}$/.test(year) && getAwardEditionView(award, Number(year)); if (!view) notFound();
  const series = getAwardSeriesView(award)!;
  return <AwardPageShell title={`${series.series.canonicalName} ${year}`} breadcrumbs={[{ label: series.series.shortName ?? series.series.canonicalName, href: `/premios/${award}` }]}>
    <div className="flex flex-wrap gap-4 border-b border-border py-4 text-sm text-muted"><span>{statuses[view.edition.status]}</span>{view.edition.ceremonyDate && <time dateTime={view.edition.ceremonyDate}>{view.edition.ceremonyDate}</time>}{view.edition.venue && <span>{view.edition.venue}</span>}</div>
    {!view.results.length && <p className="py-8 text-muted">Todavía no hay resultados publicados.</p>}
    {series.categories.filter(c => view.results.some(r => r.categoryId === c.id)).map(c => <section key={c.id} className="border-b border-border py-6"><h2 className="text-xl font-bold">{c.displayName}</h2><AwardResultList results={view.results.filter(r => r.categoryId === c.id)} covers /></section>)}
    <div className="flex flex-wrap gap-4 py-5">{getAwardSources(view.edition.sourceIds).map(s => <a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="text-sm text-accent hover:underline">{s.title}</a>)}</div>
  </AwardPageShell>;
}
