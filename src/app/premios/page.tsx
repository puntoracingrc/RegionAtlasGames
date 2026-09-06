import Link from "next/link";
import { ArrowUpRight, Trophy } from "lucide-react";
import { AwardPageShell } from "@/components/award-page-shell";
import { AwardResultList, AwardRecipient } from "@/components/award-results";
import { getPublicAwardSeries, getAwardSeriesView, getLatestAwardWinners, getUpcomingAwardEditions } from "@/lib/award-public-research";
import { awardMetadata } from "@/lib/award-seo";

export const metadata = awardMetadata("Premios del videojuego", "/premios", "Ganadores, obras y trayectorias reconocidas. Archivo de los principales premios del videojuego, con fuentes oficiales.");
export default function AwardsPage() {
  const series = getPublicAwardSeries();
  const latest = getLatestAwardWinners();
  const winners = series.flatMap(s => latest.find(r => r.seriesSlug === s.slug && getAwardSeriesView(s.slug)!.categories.some(c => c.id === r.categoryId && c.categoryType === "top_game")) ?? []);
  const upcoming = getUpcomingAwardEditions();
  const workGroups = new Map<string, typeof winners>();
  for (const result of winners) {
    const recipient = result.recipients[0];
    const key = recipient.type === "game" ? recipient.workKey ?? result.id : result.id;
    workGroups.set(key, [...(workGroups.get(key) ?? []),result]);
  }
  return <AwardPageShell title="Premios" description="Obras, equipos y trayectorias que han marcado la historia del videojuego.">
    <section className="py-7"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Últimos ganadores</h2><Link href="/premios/ultimos-ganadores" className="text-sm font-semibold text-accent">Ver ganadores <ArrowUpRight className="inline h-4 w-4" aria-hidden="true" /></Link></div>
      <div className="grid items-start gap-6 lg:grid-cols-3">{[...workGroups].map(([key,results]) => <article key={key} className="min-w-0 border-t border-border pt-5"><AwardRecipient recipient={results[0].recipients[0]} image /><AwardResultList results={results} recipients={false} /></article>)}</div>
    </section>
    {!!upcoming.length && <section className="border-t border-border py-7"><h2 className="text-xl font-bold">Próximas ceremonias</h2><ul className="mt-4 divide-y divide-border">{upcoming.map(e => <li key={e.id} className="flex flex-wrap justify-between gap-3 py-3"><Link href={`/premios/${e.seriesSlug}/${e.editionYear}`} className="font-semibold text-accent">{getAwardSeriesView(e.seriesSlug)!.series.canonicalName} {e.editionYear}</Link><time dateTime={e.ceremonyDate!}>{e.ceremonyDate}</time></li>)}</ul></section>}
    <section className="border-t border-border py-7"><h2 className="mb-5 text-xl font-bold">Premios y archivos</h2>
      <div className="grid gap-4 sm:grid-cols-2">{series.map(s => {
        const view = getAwardSeriesView(s.slug)!;
        return <article key={s.id} className="min-w-0 rounded-lg border border-border bg-card p-5"><Trophy className="mb-3 h-5 w-5 text-accent" aria-hidden="true" /><h3 className="text-lg font-bold"><Link href={`/premios/${s.slug}`} className="hover:text-accent">{s.canonicalName}</Link></h3><p className="mt-2 text-sm leading-6 text-muted">{s.descriptionEs}</p><div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted"><span>{view.editions.length} ediciones</span><span>{view.results.length} resultados</span></div></article>;
      })}</div>
    </section>
  </AwardPageShell>;
}
