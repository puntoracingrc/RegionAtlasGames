import Link from "next/link";
import { connection } from "next/server";
import { Panel, PanelTitle } from "@/components/ui";
import { AdminNotice } from "@/components/admin/admin-visual";
import { AwardCopyInstruction } from "@/components/admin/award-copy-instruction";
import { awardCalendarDay, awardUpdateInstruction, getAwardTemporalState } from "@/lib/award-calendar";
import { getPendingAwardEditions, getAwardSeriesView } from "@/lib/award-public-research";

export default async function AdminAwardsPage() {
  await connection();
  const today = awardCalendarDay(new Date());
  const pending = getPendingAwardEditions(today);
  return <Panel>
    <PanelTitle>Premios · {pending.length} pendientes</PanelTitle>
    {!pending.length && <AdminNotice tone="status">No hay ceremonias pendientes de actualizar.</AdminNotice>}
    {(["today", "awaiting_results"] as const).map(state => {
      const editions = pending.filter(e => getAwardTemporalState(e, today) === state);
      if (!editions.length) return null;
      return <section key={state} className="mt-6">
        <h2 className="text-lg font-bold">{state === "today" ? "Premios que se celebran hoy" : "Premios celebrados pendientes de actualizar"}</h2>
        <ul className="divide-y divide-border">{editions.map(edition => {
          const series = getAwardSeriesView(edition.seriesSlug)!.series;
          return <li key={edition.id} className="space-y-3 py-5">
            <Link className="font-semibold text-accent" href={`/premios/${series.slug}/${edition.editionYear}`}>{series.canonicalName} {edition.editionYear}</Link>
            <AdminNotice tone="search">{state === "today" ? "Se celebra hoy" : `Celebrada el ${edition.ceremonyDate!.split("-").reverse().join("/")}`} · resultados pendientes</AdminNotice>
            <AwardCopyInstruction text={awardUpdateInstruction(series.canonicalName, edition, series.officialUrl)} />
          </li>;
        })}</ul>
      </section>;
    })}
  </Panel>;
}
