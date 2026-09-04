import type { Metadata } from "next";
import Link from "next/link";
import {
  BookOpenCheck,
  Database,
  ExternalLink,
  Link2Off,
  LockKeyhole,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { AdminNotice, adminToneClass } from "@/components/admin/admin-visual";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import {
  getAdminCompanyResearchOverview,
  type CompanyResearchAdminFilter,
} from "@/lib/admin-company-research";

export const metadata: Metadata = {
  title: "Investigación de compañías | Admin Region Atlas",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{
    q?: string;
    estado?: string;
    pagina?: string;
  }>;
};

const filters: { value: CompanyResearchAdminFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "accepted", label: "Núcleo interno" },
  { value: "blocked", label: "Bloqueados" },
  { value: "published", label: "Publicación autorizada" },
  { value: "qid-collision", label: "Colisiones QID" },
];

function validFilter(value: string | undefined): CompanyResearchAdminFilter {
  return filters.some((filter) => filter.value === value)
    ? (value as CompanyResearchAdminFilter)
    : "all";
}

function researchHref(input: {
  query?: string;
  filter?: CompanyResearchAdminFilter;
  page?: number;
}): string {
  const params = new URLSearchParams();
  if (input.query) params.set("q", input.query);
  if (input.filter && input.filter !== "all") params.set("estado", input.filter);
  if (input.page && input.page > 1) params.set("pagina", String(input.page));
  const query = params.toString();
  return query ? `/admin/entidades/investigacion?${query}` : "/admin/entidades/investigacion";
}

function yearLabel(foundedYear: number | null, closedYear: number | null): string | null {
  if (foundedYear && closedYear) return `${foundedYear}-${closedYear}`;
  if (foundedYear) return `Desde ${foundedYear}`;
  if (closedYear) return `Cierre ${closedYear}`;
  return null;
}

export default async function AdminCompanyResearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const requestedPage = Number.parseInt(params.pagina ?? "1", 10);
  const overview = getAdminCompanyResearchOverview({
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
            Catálogo interno
          </p>
          <h2 className="mt-1 text-2xl font-black text-foreground">Investigación de compañías</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Vista previa del lote auditado. Los datos internos y bloqueados solo existen en Admin;
            la proyección pública está limitada a los registros aprobados.
          </p>
        </div>
        <Link href="/admin/entidades?tab=companies" className="btn-secondary">
          Volver a compañías
        </Link>
      </div>

      <Panel className={adminToneClass("search")}>
        <PanelTitle eyebrow="Importación aditiva">Control del lote</PanelTitle>
        <dl className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          <div className="p-3 sm:first:pl-0">
            <dt className="flex items-center gap-2 text-xs font-semibold text-muted">
              <Database className="h-4 w-4" aria-hidden="true" /> Núcleo interno
            </dt>
            <dd className="mt-2 text-2xl font-black text-foreground">
              {counts.internalCore.toLocaleString("es-ES")}
            </dd>
          </div>
          <div className="p-3">
            <dt className="flex items-center gap-2 text-xs font-semibold text-muted">
              <LockKeyhole className="h-4 w-4" aria-hidden="true" /> Bloqueados
            </dt>
            <dd className="mt-2 text-2xl font-black text-foreground">
              {counts.blocked.toLocaleString("es-ES")}
            </dd>
          </div>
          <div className="p-3">
            <dt className="flex items-center gap-2 text-xs font-semibold text-muted">
              <BookOpenCheck className="h-4 w-4" aria-hidden="true" /> Publicación
            </dt>
            <dd className="mt-2 text-2xl font-black text-foreground">
              {counts.publishedHistories} historias · {counts.publishedAchievements} hitos
            </dd>
          </div>
          <div className="p-3 sm:last:pr-0">
            <dt className="flex items-center gap-2 text-xs font-semibold text-muted">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Identidad
            </dt>
            <dd className="mt-2 text-2xl font-black text-foreground">
              {counts.publishedQidCorrections} QID corregidos
            </dd>
          </div>
        </dl>
      </Panel>

      <AdminNotice tone="status">
        <strong className="text-foreground">Barrera pública activa.</strong>{" "}
        Los {counts.qidCollisionGroups} grupos con QID compartido conservan sus slugs. No se ha
        importado ninguna relación corporativa ni se ha modificado ningún crédito de juego.
      </AdminNotice>

      <Panel className={adminToneClass("edit")}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <PanelTitle eyebrow="Revisión">Registros ({overview.total.toLocaleString("es-ES")})</PanelTitle>
          <span className="text-xs text-muted">
            {first.toLocaleString("es-ES")}-{last.toLocaleString("es-ES")} de {overview.total.toLocaleString("es-ES")}
          </span>
        </div>

        <form action="/admin/entidades/investigacion" method="get" className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_15rem_auto]">
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Buscar</span>
            <input
              className="input w-full"
              type="search"
              name="q"
              defaultValue={overview.query}
              placeholder="Nombre, slug o QID"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Estado</span>
            <select className="input w-full" name="estado" defaultValue={overview.filter}>
              {filters.map((filter) => (
                <option key={filter.value} value={filter.value}>{filter.label}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn-primary" title="Aplicar filtros">
              <Search className="h-4 w-4" aria-hidden="true" />
              <span>Filtrar</span>
            </button>
            {(overview.query || overview.filter !== "all") && (
              <Link href="/admin/entidades/investigacion" className="btn-secondary" title="Limpiar filtros">
                <X className="h-4 w-4" aria-hidden="true" />
                <span>Limpiar</span>
              </Link>
            )}
          </div>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          {filters.map((filter) => (
            <Link
              key={filter.value}
              href={researchHref({ query: overview.query, filter: filter.value })}
              className={overview.filter === filter.value ? "btn-primary px-3 py-2 text-xs" : "btn-secondary px-3 py-2 text-xs"}
            >
              {filter.label}
            </Link>
          ))}
        </div>

        <ul className="mt-5 divide-y divide-border border-y border-border">
          {overview.records.map((record) => {
            const years = yearLabel(record.foundedYear, record.closedYear);
            return (
              <li key={record.slug} className="grid gap-3 py-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/compania/${record.slug}`}
                      className="font-semibold text-foreground hover:text-accent"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {record.name}
                    </Link>
                    <Badge tone={record.gate === "accepted" ? "green" : "amber"}>
                      {record.gate === "accepted" ? "Interno aceptado" : "Bloqueado"}
                    </Badge>
                    {record.publicChanges.map((change) => <Badge key={change} tone="violet">{change}</Badge>)}
                  </div>
                  <p className="mt-1 truncate font-mono text-xs text-muted">{record.slug}</p>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  {record.qid && (
                    <a href={`https://www.wikidata.org/wiki/${record.qid}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-accent">
                      {record.qid}<ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  )}
                  {years && <span>{years}</span>}
                  {record.countries.length > 0 && <span>{record.countries.join(" · ")}</span>}
                  {record.gate === "accepted" && <span>{record.provenanceCount} campos con procedencia</span>}
                </div>
                <div className="max-w-xl text-xs text-muted lg:text-right">
                  {record.reasons.length > 0 ? record.reasons.join(" · ") : record.confidence}
                </div>
              </li>
            );
          })}
        </ul>

        {overview.records.length === 0 && (
          <p className="py-10 text-center text-sm text-muted">No hay resultados con estos filtros.</p>
        )}

        {overview.totalPages > 1 && (
          <nav className="mt-5 flex items-center justify-center gap-2" aria-label="Paginación de investigación">
            <Link
              href={researchHref({ query: overview.query, filter: overview.filter, page: overview.page - 1 })}
              aria-disabled={overview.page === 1}
              className={overview.page === 1 ? "btn-secondary pointer-events-none opacity-45" : "btn-secondary"}
            >
              Anterior
            </Link>
            <span className="px-2 text-sm font-semibold text-foreground">{overview.page} / {overview.totalPages}</span>
            <Link
              href={researchHref({ query: overview.query, filter: overview.filter, page: overview.page + 1 })}
              aria-disabled={overview.page === overview.totalPages}
              className={overview.page === overview.totalPages ? "btn-secondary pointer-events-none opacity-45" : "btn-secondary"}
            >
              Siguiente
            </Link>
          </nav>
        )}
      </Panel>

      <Panel className={adminToneClass("danger")}>
        <PanelTitle eyebrow="Relaciones retiradas">Conflictos históricos</PanelTitle>
        <ul className="divide-y divide-border border-y border-border">
          {overview.relationshipExclusions.map((relation) => (
            <li key={relation.companySlug} className="flex gap-3 py-4">
              <Link2Off className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
              <div>
                <p className="font-semibold text-foreground">{relation.companySlug}</p>
                <p className="mt-1 text-sm leading-6 text-muted">{relation.reason}</p>
                {relation.sourceUrl && (
                  <a
                    href={relation.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                  >
                    Fuente oficial
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
