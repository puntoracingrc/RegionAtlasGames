import Link from "next/link";
import { notFound } from "next/navigation";
import { AwardPageShell } from "@/components/award-page-shell";
import { AwardResultList } from "@/components/award-results";
import { getAwardSeriesView } from "@/lib/award-public-research";
import { awardMetadata } from "@/lib/award-seo";
type Props = { params: Promise<{ award: string }> };
export async function generateMetadata({ params }: Props) {
  const { award } = await params; const view = getAwardSeriesView(award);
  return view ? awardMetadata(view.series.canonicalName, `/premios/${award}`, view.series.descriptionEs ?? "Archivo de ganadores y ediciones.") : {};
}
export default async function AwardSeriesPage({ params }: Props) {
  const { award } = await params; const view = getAwardSeriesView(award); if (!view) notFound();
  const { series, editions, categories, results } = view;
  const top = categories.filter(c => c.categoryType === "top_game");
  return <AwardPageShell title={series.canonicalName} description={series.descriptionEs}>
    <dl className="flex flex-wrap gap-x-8 gap-y-4 border-b border-border py-5 text-sm">{[["Ediciones documentadas", editions.length], ["Categorías importadas", categories.length], ["Resultados verificados", results.length]].map(([label, value]) => <div key={label}><dt className="text-muted">{label}</dt><dd className="mt-1 text-xl font-bold">{value}</dd></div>)}</dl>
    <dl className="grid gap-5 border-b border-border py-6 text-sm sm:grid-cols-3">{[["Organización", series.organizer], ["Selección", series.selectionModel], ["Especialidad", series.specialization]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt className="font-semibold">{label}</dt><dd className="mt-2 leading-6 text-muted">{value}</dd></div>)}</dl>
    <section className="py-6"><h2 className="text-xl font-bold">Archivo anual</h2><div className="mt-4 flex flex-wrap gap-3">{[...editions].sort((a,b) => b.editionYear-a.editionYear).map(e => <Link key={e.id} href={`/premios/${award}/${e.editionYear}`} className="border-b border-border px-2 py-2 font-semibold text-accent hover:underline">{e.editionYear}</Link>)}</div></section>
    {top.map(category => <section key={category.id} className="border-t border-border py-6"><h2 className="text-xl font-bold"><Link href={`/premios/${award}/categoria/${category.slug}`} className="hover:text-accent">{category.displayName}</Link></h2><AwardResultList results={results.filter(r => r.categoryId === category.id && r.resultType === "winner").sort((a,b) => b.editionId.localeCompare(a.editionId))} /></section>)}
    <a href={series.officialUrl} rel="noreferrer" target="_blank" className="text-sm font-semibold text-accent hover:underline">Archivo oficial de {series.shortName ?? series.canonicalName}</a>
  </AwardPageShell>;
}
