import Link from "next/link";
import { Building2, Cpu, ExternalLink, Gamepad2, History, Network } from "lucide-react";
import { PersonPortrait } from "@/components/person-portrait";
import { PlatformHardwareExplorer } from "@/components/platform-hardware-explorer";
import type {
  PlatformHardwareGroupId,
  PlatformHistory,
  PlatformHistorySource,
} from "@/lib/platform-history-types";

function SourceReference({ source }: { source: PlatformHistorySource }) {
  const label = [source.publication, source.citation].filter(Boolean).join(" · ");
  if (!source.url) {
    return <span className="text-sm text-foreground/75">{label}</span>;
  }
  return (
    <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
      {label}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  );
}

export function PlatformHistorySection({
  history,
  figurePortraits,
  initialHardwareGroup,
}: {
  history: PlatformHistory;
  figurePortraits: Record<string, string | null>;
  initialHardwareGroup?: PlatformHardwareGroupId;
}) {
  const figureNames = Object.fromEntries(
    history.figures.map((figure) => [figure.personSlug, figure.personName]),
  );

  return (
    <section id="historia" className="mb-12 scroll-mt-24 border-y border-border py-8 md:py-10">
      <div className="flex flex-col gap-4 border-b border-border pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-4xl">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-accent">
            <History className="h-4 w-4" aria-hidden="true" />
            Archivo editorial
          </div>
          <h2 className="mt-3 text-2xl font-black text-foreground md:text-3xl">Historia de la plataforma</h2>
          <p className="mt-3 text-base leading-7 text-foreground/75">{history.dekEs}</p>
        </div>
        <dl className="grid grid-cols-3 gap-5 border-l-0 border-border lg:border-l lg:pl-7">
          <div><dt className="text-xs text-muted">Figuras</dt><dd className="mt-1 text-2xl font-black text-foreground">{history.figures.length}</dd></div>
          <div><dt className="text-xs text-muted">Compañías</dt><dd className="mt-1 text-2xl font-black text-foreground">{history.companies.length}</dd></div>
          <div><dt className="text-xs text-muted">Hardware</dt><dd className="mt-1 text-2xl font-black text-foreground">{history.hardware.length}</dd></div>
        </dl>
      </div>

      <div id="historia-resumen" className="scroll-mt-24 grid gap-4 py-7 text-sm leading-7 text-foreground/85 md:grid-cols-2">
        {history.summaryParagraphsEs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </div>

      <section id="historia-figuras" className="scroll-mt-24 border-t border-border py-7">
        <div className="flex items-end justify-between gap-3">
          <div><h3 className="text-xl font-bold text-foreground">Figuras clave</h3><p className="mt-1 text-sm text-muted">Personas conectadas con su aportación documentada.</p></div>
          <span className="text-sm font-semibold text-muted">{history.figures.length}</span>
        </div>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {history.figures.map((figure) => (
            <li key={figure.personSlug}>
              <Link href={`/persona/${figure.personSlug}`} className="grid h-full min-h-36 grid-cols-[4.5rem_minmax(0,1fr)] gap-4 rounded-lg border border-border bg-card p-3.5 transition hover:border-accent/40 hover:bg-card-hover">
                <PersonPortrait src={figurePortraits[figure.personSlug] ?? null} name={figure.personName} sizes="72px" className="h-24 w-[4.5rem] rounded-md border border-border" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-accent">{figure.roleLabelEs}</p>
                  <h4 className="mt-1 font-bold text-foreground">{figure.personName}</h4>
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-foreground/70">{figure.contributionEs}</p>
                  {figure.period && <p className="mt-2 text-xs font-medium text-muted">{figure.period}</p>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section id="historia-companias" className="scroll-mt-24 border-t border-border py-7">
        <div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-accent" aria-hidden="true" /><h3 className="text-xl font-bold text-foreground">Compañías que definieron la generación</h3></div>
        <ul className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {history.companies.map((company) => (
            <li key={company.companySlug} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-xs font-semibold uppercase tracking-wider text-muted">{company.relationshipLabelEs}</p><Link href={`/compania/${company.companySlug}`} className="mt-1 block font-bold text-foreground hover:text-accent">{company.companyName}</Link></div>
                {company.period && <span className="shrink-0 text-xs font-medium text-accent">{company.period}</span>}
              </div>
              <p className="mt-3 text-sm leading-6 text-foreground/75">{company.contributionEs}</p>
              {company.relatedCatalogEntries && company.relatedCatalogEntries.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                  {company.relatedCatalogEntries.map((game) => <Link key={game.id} href={`/catalogo/${game.id}`} className="text-xs font-medium text-accent hover:underline">{game.title}</Link>)}
                </div>
              ) : company.relatedWorks.length > 0 ? <p className="mt-3 text-xs leading-5 text-muted">{company.relatedWorks.join(" · ")}</p> : null}
            </li>
          ))}
        </ul>

        <div className="mt-6 border-l-2 border-accent/50 pl-4">
          <div className="flex items-center gap-2"><Network className="h-4 w-4 text-accent" aria-hidden="true" /><h4 className="font-bold text-foreground">Genealogía empresarial</h4></div>
          <ol className="mt-3 divide-y divide-border">
            {history.genealogies.map((relation) => (
              <li key={relation.id} className="grid gap-1 py-3 text-sm md:grid-cols-[7rem_minmax(0,1fr)]">
                <span className="font-bold text-accent">{relation.year ?? "Sin fecha"}</span>
                <p className="leading-6 text-foreground/80">
                  <Link href={`/compania/${relation.sourceCompanySlug}`} className="font-semibold text-foreground hover:text-accent">{relation.sourceCompanyName}</Link>
                  {relation.targetCompanySlug && relation.targetCompanyName ? <>{" → "}<Link href={`/compania/${relation.targetCompanySlug}`} className="font-semibold text-foreground hover:text-accent">{relation.targetCompanyName}</Link></> : null}
                  {" · "}{relation.summaryEs}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="historia-hardware" className="scroll-mt-24 border-t border-border py-7">
        <div className="flex items-center gap-2"><Cpu className="h-5 w-5 text-accent" aria-hidden="true" /><h3 className="text-xl font-bold text-foreground">Evolución técnica y control</h3></div>
        <PlatformHardwareExplorer hardware={history.hardware} personNames={figureNames} initialGroup={initialHardwareGroup} />
      </section>

      <section id="historia-cronologia" className="scroll-mt-24 border-t border-border py-7">
        <div className="flex items-center gap-2"><Gamepad2 className="h-5 w-5 text-accent" aria-hidden="true" /><h3 className="text-xl font-bold text-foreground">Cronología</h3></div>
        <ol className="mt-4 divide-y divide-border border-y border-border">
          {history.milestones.map((milestone) => (
            <li key={milestone.id} className="grid gap-2 py-4 md:grid-cols-[7rem_minmax(0,1fr)]"><span className="font-black text-accent">{milestone.yearLabel}</span><div><h4 className="font-semibold text-foreground">{milestone.title}</h4><p className="mt-1 text-sm leading-6 text-foreground/70">{milestone.summaryEs}</p></div></li>
          ))}
        </ol>
      </section>

      <section id="historia-legado" className="scroll-mt-24 border-t border-border py-7">
        <h3 className="text-xl font-bold text-foreground">Legado</h3>
        <div className="mt-4 grid gap-4 text-sm leading-7 text-foreground/80 md:grid-cols-2">{history.legacyEs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
      </section>

      <footer className="border-t border-border pt-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Fuentes</p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">{history.sources.map((source) => <SourceReference key={source.id} source={source} />)}</div>
        <p className="mt-3 text-xs text-muted">Revisión editorial: {new Date(history.lastReviewed).toLocaleDateString("es-ES")}</p>
      </footer>
    </section>
  );
}
