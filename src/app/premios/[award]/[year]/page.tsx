import { notFound } from "next/navigation";
import { AwardPageShell } from "@/components/award-page-shell";
import { AwardLogo } from "@/components/award-logo";
import { approvedAwardLogo, getAwardVisualIdentity } from "@/lib/award-visual-identity";
import Link from "next/link";
import { connection } from "next/server";
import { awardCalendarDay, getAwardTemporalState } from "@/lib/award-calendar";
import { AwardResults } from "@/components/award-results";
import { getAwardEditionView, getAwardSeriesView, getAwardSources } from "@/lib/award-public-research";
import { awardMetadata } from "@/lib/award-seo";
type Props = { params: Promise<{ award: string; year: string }> };
const statuses = { completed: "Celebrada", corrected: "Resultados actualizados", upcoming: "Próxima edición", nominations_announced: "Nominaciones anunciadas", voting_open: "Votación abierta", ceremony_in_progress: "Ceremonia en curso" };
export async function generateMetadata({ params }: Props) {
  const { award, year } = await params; const view = /^\d{4}$/.test(year) && getAwardEditionView(award, Number(year));
  return view ? awardMetadata(`${getAwardSeriesView(award)!.series.canonicalName} ${year}`, `/premios/${award}/${year}`, "Ganadores, nominaciones y fuentes oficiales de esta edición.") : {};
}
export default async function AwardEditionPage({ params }: Props) {
  await connection();
  const { award, year } = await params; const view = /^\d{4}$/.test(year) && getAwardEditionView(award, Number(year)); if (!view) notFound();
  const series = getAwardSeriesView(award)!;
  const temporal = getAwardTemporalState(view.edition, awardCalendarDay(new Date()));
  const status = temporal === "today" ? "Se celebra hoy · resultados pendientes" : temporal === "awaiting_results" ? "Celebrada · resultados pendientes" : statuses[view.edition.status];
  return <AwardPageShell title={`${series.series.canonicalName} ${year}`} breadcrumbs={[{ label: series.series.shortName ?? series.series.canonicalName, href: `/premios/${award}` }]}>
    {approvedAwardLogo(getAwardVisualIdentity(award), Number(year)) && <Link href={`/premios/${award}`} className="inline-block"><AwardLogo slug={award} name={series.series.canonicalName} year={Number(year)} /></Link>}
    <div className="flex flex-wrap gap-4 border-b border-border py-4 text-sm text-muted"><span>{status}</span>{view.edition.ceremonyDate && <time dateTime={view.edition.ceremonyDate}>{view.edition.ceremonyDate}</time>}{view.edition.venue && <span>{view.edition.venue}</span>}</div>
    {!view.results.length && <p className="py-8 text-muted">Todavía no hay resultados publicados.</p>}
    {series.categories.filter(c => view.results.some(r => r.categoryId === c.id)).map(c => <section key={c.id} className="border-b border-border py-6"><h2 className="text-xl font-bold"><Link href={`/premios/${award}/categoria/${c.slug}`} className="hover:text-accent">{c.displayName}</Link></h2><AwardResults results={view.results.filter(r => r.categoryId === c.id)} /></section>)}
    <div className="flex flex-wrap gap-4 py-5">{getAwardSources(view.edition.sourceIds).map(s => <a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="text-sm text-accent hover:underline">{s.title}</a>)}</div>
  </AwardPageShell>;
}
