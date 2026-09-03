import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, ImageIcon, LockKeyhole, Search, ShieldCheck, UserRoundCheck, UsersRound, X } from "lucide-react";
import { AdminNotice, adminToneClass } from "@/components/admin/admin-visual";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import { getAdminPersonResearchOverview } from "@/lib/admin-person-research";
import type { PersonAdminFilter } from "@/lib/person-research-types";

export const metadata: Metadata = {
  title: "Investigación de personas | Admin Region Atlas",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ q?: string; estado?: string; pagina?: string }>;
};

const filters: { value: PersonAdminFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "published", label: "Públicos" },
  { value: "editorial", label: "Editoriales públicas" },
  { value: "structured", label: "Estructurados internos" },
  { value: "staging", label: "Bloqueados" },
];

function validFilter(value: string | undefined): PersonAdminFilter {
  return filters.some((filter) => filter.value === value) ? value as PersonAdminFilter : "all";
}

function href(input: { query?: string; filter?: PersonAdminFilter; page?: number }): string {
  const params = new URLSearchParams();
  if (input.query) params.set("q", input.query);
  if (input.filter && input.filter !== "all") params.set("estado", input.filter);
  if (input.page && input.page > 1) params.set("pagina", String(input.page));
  const query = params.toString();
  return query ? `/admin/entidades/personas?${query}` : "/admin/entidades/personas";
}

function gateBadge(gate: "editorial" | "structured" | "staging") {
  if (gate === "editorial") return <Badge tone="green">Editorial pública</Badge>;
  if (gate === "structured") return <Badge tone="violet">Estructurada interna</Badge>;
  return <Badge tone="amber">Bloqueada</Badge>;
}

export default async function AdminPeopleResearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const requestedPage = Number.parseInt(params.pagina ?? "1", 10);
  const overview = getAdminPersonResearchOverview({
    query: params.q,
    filter: validFilter(params.estado),
    page: Number.isFinite(requestedPage) ? requestedPage : 1,
  });
  const counts = overview.manifest.counts;
  const first = overview.total === 0 ? 0 : (overview.page - 1) * overview.pageSize + 1;
  const last = Math.min(overview.total, overview.page * overview.pageSize);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Entidades personales</p>
          <h2 className="mt-1 text-2xl font-black text-foreground">Investigación de personas</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Identidades enlazadas por QID, procedencia por campo y revisión separada para perfiles públicos, estructurados internos y bloqueados.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/persona" target="_blank" rel="noreferrer" className="btn-secondary gap-2">
            Ver índice público<ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link href="/admin/entidades?tab=companies" className="btn-secondary">Volver a entidades</Link>
        </div>
      </div>

      <Panel className={adminToneClass("search")}>
        <PanelTitle eyebrow="Lote auditado">Control de publicación</PanelTitle>
        <dl className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          <div className="p-3 sm:first:pl-0"><dt className="flex items-center gap-2 text-xs font-semibold text-muted"><UsersRound className="h-4 w-4" aria-hidden="true" /> Identidades</dt><dd className="mt-2 text-2xl font-black text-foreground">{counts.totalPeople}</dd></div>
          <div className="p-3"><dt className="flex items-center gap-2 text-xs font-semibold text-muted"><UserRoundCheck className="h-4 w-4" aria-hidden="true" /> Editoriales públicas</dt><dd className="mt-2 text-2xl font-black text-foreground">{counts.publishedPeople}</dd><p className="mt-1 text-xs text-muted">Únicas con ruta, sitemap y SEO</p></div>
          <div className="p-3"><dt className="flex items-center gap-2 text-xs font-semibold text-muted"><LockKeyhole className="h-4 w-4" aria-hidden="true" /> Solo Admin</dt><dd className="mt-2 text-2xl font-black text-foreground">{counts.structuredPeople + counts.stagingPeople}</dd><p className="mt-1 text-xs text-muted">{counts.structuredPeople} estructuradas · {counts.stagingPeople} bloqueadas</p></div>
          <div className="p-3 sm:last:pr-0"><dt className="flex items-center gap-2 text-xs font-semibold text-muted"><ImageIcon className="h-4 w-4" aria-hidden="true" /> Retratos conservados</dt><dd className="mt-2 text-2xl font-black text-foreground">{counts.retainedPortraits}</dd><p className="mt-1 text-xs text-muted">{counts.publicPortraits} visibles · licencias intactas</p></div>
        </dl>
      </Panel>

      <AdminNotice tone="status">
        <strong className="text-foreground">Barrera pública activa.</strong>{" "}
        Los {counts.structuredPeople} perfiles estructurados y los {counts.stagingPeople} bloqueados quedan fuera de rutas públicas, sitemap y SEO. Sus relaciones documentales permanecen en revisión dentro de Admin; compartir nombre no fusiona identidades.
      </AdminNotice>

      <Panel className={adminToneClass("edit")}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <PanelTitle eyebrow="Revisión">Perfiles ({overview.total.toLocaleString("es-ES")})</PanelTitle>
          <span className="text-xs text-muted">{first}-{last} de {overview.total.toLocaleString("es-ES")}</span>
        </div>
        <form action="/admin/entidades/personas" method="get" className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_15rem_auto]">
          <label className="space-y-1"><span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Buscar</span><input className="input" type="search" name="q" defaultValue={overview.query} placeholder="Nombre, alias, QID, origen u ocupación" /></label>
          <label className="space-y-1"><span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Estado</span><select className="input" name="estado" defaultValue={overview.filter}>{filters.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}</select></label>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn-primary gap-2"><Search className="h-4 w-4" aria-hidden="true" /> Filtrar</button>
            {(overview.query || overview.filter !== "all") && <Link href="/admin/entidades/personas" className="btn-secondary gap-2"><X className="h-4 w-4" aria-hidden="true" /> Limpiar</Link>}
          </div>
        </form>
        <div className="mt-4 flex flex-wrap gap-2">
          {filters.map((filter) => <Link key={filter.value} href={href({ query: overview.query, filter: filter.value })} className={overview.filter === filter.value ? "btn-primary px-3 py-2 text-xs" : "btn-secondary px-3 py-2 text-xs"}>{filter.label}</Link>)}
        </div>

        <ul className="mt-5 divide-y divide-border border-y border-border">
          {overview.records.map((record) => (
            <li key={record.slug} className="grid gap-3 py-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {record.gate === "editorial" ? <Link href={`/persona/${record.slug}`} target="_blank" rel="noreferrer" className="font-semibold text-foreground hover:text-accent">{record.name}</Link> : <span className="font-semibold text-foreground">{record.name}</span>}
                  {gateBadge(record.gate)}
                  {record.portrait && <Badge>Retrato</Badge>}
                </div>
                <p className="mt-1 truncate font-mono text-xs text-muted">{record.slug} · {record.qid}</p>
              </div>
              <div className="text-xs leading-5 text-muted">
                <p>{[record.birthYear, record.origin].filter(Boolean).join(" · ") || "Sin cronología básica"}</p>
                <p className="truncate">{record.occupations.join(" · ") || "Sin ocupación documentada"}</p>
              </div>
              <div className="text-xs text-muted lg:text-right">
                <p>{record.relations} relaciones documentales en revisión · {record.exactCredits} créditos · {record.sources} fuentes</p>
                {record.reasons.length > 0 && <p className="mt-1 max-w-xl text-amber-700 dark:text-amber-300">{record.reasons.join(" · ")}</p>}
              </div>
            </li>
          ))}
        </ul>

        {overview.records.length === 0 && <p className="py-10 text-center text-sm text-muted">No hay perfiles que coincidan con los filtros.</p>}
        {overview.totalPages > 1 && (
          <nav className="mt-5 flex items-center justify-center gap-2" aria-label="Paginación de personas">
            <Link href={href({ query: overview.query, filter: overview.filter, page: overview.page - 1 })} aria-disabled={overview.page === 1} className={overview.page === 1 ? "btn-secondary pointer-events-none opacity-45" : "btn-secondary"}>Anterior</Link>
            <span className="px-2 text-sm font-semibold text-foreground">{overview.page} / {overview.totalPages}</span>
            <Link href={href({ query: overview.query, filter: overview.filter, page: overview.page + 1 })} aria-disabled={overview.page === overview.totalPages} className={overview.page === overview.totalPages ? "btn-secondary pointer-events-none opacity-45" : "btn-secondary"}>Siguiente</Link>
          </nav>
        )}
      </Panel>

      <Panel className={adminToneClass("status")}>
        <PanelTitle eyebrow="Garantías">Reglas de identidad y evidencia</PanelTitle>
        <div className="grid gap-3 text-sm text-muted md:grid-cols-3">
          <p className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> QID como identidad estable; slug únicamente como ruta.</p>
          <p className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> Las obras asociadas nunca se muestran como crédito profesional.</p>
          <p className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> No se publican datos privados ni sensibles.</p>
        </div>
      </Panel>
    </div>
  );
}
