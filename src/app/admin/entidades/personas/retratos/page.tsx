import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, ImageIcon, Search, Upload, UsersRound, X } from "lucide-react";
import { AdminPersonPortraitUploader } from "@/components/admin/admin-person-portrait-uploader";
import { AdminNotice, adminToneClass } from "@/components/admin/admin-visual";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import { getPersonCards } from "@/lib/person-public-research";
import { readAdminPersonPortraitsSafely } from "@/lib/person-portrait-storage";

export const metadata: Metadata = {
  title: "Retratos de personas | Admin Region Atlas",
  robots: { index: false, follow: false },
};

type PortraitFilter = "all" | "missing" | "visible" | "uploaded";

type Props = {
  searchParams: Promise<{ q?: string; estado?: string; pagina?: string }>;
};

const PAGE_SIZE = 36;
const filters: { value: PortraitFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "missing", label: "Sin retrato" },
  { value: "visible", label: "Con retrato" },
  { value: "uploaded", label: "Cargadas en Admin" },
];

function normalize(value: string): string {
  return value.toLocaleLowerCase("es").normalize("NFD").replace(/\p{M}/gu, "");
}

function validFilter(value: string | undefined): PortraitFilter {
  return filters.some((filter) => filter.value === value) ? value as PortraitFilter : "all";
}

function href(input: { query?: string; filter?: PortraitFilter; page?: number }): string {
  const params = new URLSearchParams();
  if (input.query) params.set("q", input.query);
  if (input.filter && input.filter !== "all") params.set("estado", input.filter);
  if (input.page && input.page > 1) params.set("pagina", String(input.page));
  const query = params.toString();
  return query
    ? `/admin/entidades/personas/retratos?${query}`
    : "/admin/entidades/personas/retratos";
}

export default async function AdminPersonPortraitsPage({ searchParams }: Props) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const normalizedQuery = normalize(query);
  const filter = validFilter(params.estado);
  const uploadedPortraits = await readAdminPersonPortraitsSafely();
  const people = getPersonCards()
    .map((person) => ({
      ...person,
      uploaded: uploadedPortraits[person.slug] ?? null,
      visiblePortraitPath: uploadedPortraits[person.slug]?.path ?? person.portraitPath,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
  const visibleCount = people.filter((person) => Boolean(person.visiblePortraitPath)).length;
  const uploadedCount = people.filter((person) => Boolean(person.uploaded)).length;
  const filtered = people
    .filter((person) => {
      if (filter === "missing") return !person.visiblePortraitPath;
      if (filter === "visible") return Boolean(person.visiblePortraitPath);
      if (filter === "uploaded") return Boolean(person.uploaded);
      return true;
    })
    .filter((person) => !normalizedQuery || normalize(person.searchHaystack).includes(normalizedQuery));
  const requestedPage = Number.parseInt(params.pagina ?? "1", 10);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(
    totalPages,
    Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1),
  );
  const pagePeople = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const first = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(filtered.length, page * PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Personas públicas</p>
          <h2 className="mt-1 text-2xl font-black text-foreground">Retratos de personas</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Sube o sustituye directamente las fotografías visibles de las {people.length} personas publicadas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/persona" target="_blank" rel="noreferrer" className="btn-secondary gap-2">
            Ver página pública<ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link href="/admin/entidades/personas" className="btn-secondary">
            Investigación y evidencia
          </Link>
        </div>
      </div>

      <Panel className={adminToneClass("media")}>
        <PanelTitle eyebrow="Cobertura pública">Biblioteca de retratos</PanelTitle>
        <dl className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          <div className="p-3 sm:first:pl-0">
            <dt className="flex items-center gap-2 text-xs font-semibold text-muted"><UsersRound className="h-4 w-4" aria-hidden="true" /> Personas públicas</dt>
            <dd className="mt-2 text-2xl font-black text-foreground">{people.length}</dd>
          </div>
          <div className="p-3">
            <dt className="flex items-center gap-2 text-xs font-semibold text-muted"><ImageIcon className="h-4 w-4" aria-hidden="true" /> Con retrato</dt>
            <dd className="mt-2 text-2xl font-black text-foreground">{visibleCount}</dd>
          </div>
          <div className="p-3">
            <dt className="flex items-center gap-2 text-xs font-semibold text-muted"><X className="h-4 w-4" aria-hidden="true" /> Pendientes</dt>
            <dd className="mt-2 text-2xl font-black text-foreground">{people.length - visibleCount}</dd>
          </div>
          <div className="p-3 sm:last:pr-0">
            <dt className="flex items-center gap-2 text-xs font-semibold text-muted"><Upload className="h-4 w-4" aria-hidden="true" /> Cargas Admin</dt>
            <dd className="mt-2 text-2xl font-black text-foreground">{uploadedCount}</dd>
          </div>
        </dl>
      </Panel>

      <AdminNotice tone="status">
        <strong className="text-foreground">Acceso restringido a administradores.</strong>{" "}
        Arrastra una imagen o pulsa su recuadro. Se valida, se convierte a WebP y queda guardada de forma persistente. Al subirla confirmas que tienes autorización o base legal para publicarla.
      </AdminNotice>

      <Panel className={adminToneClass("edit")}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <PanelTitle eyebrow="Carga directa">Personas ({filtered.length.toLocaleString("es-ES")})</PanelTitle>
          <span className="text-xs text-muted">{first}-{last} de {filtered.length.toLocaleString("es-ES")}</span>
        </div>
        <form action="/admin/entidades/personas/retratos" method="get" className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_15rem_auto]">
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Buscar</span>
            <input className="input" type="search" name="q" defaultValue={query} placeholder="Nombre, ocupación, compañía u obra" />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Estado</span>
            <select className="input" name="estado" defaultValue={filter}>
              {filters.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn-primary gap-2"><Search className="h-4 w-4" aria-hidden="true" /> Filtrar</button>
            {(query || filter !== "all") && (
              <Link href="/admin/entidades/personas/retratos" className="btn-secondary gap-2"><X className="h-4 w-4" aria-hidden="true" /> Limpiar</Link>
            )}
          </div>
        </form>
        <div className="mt-4 flex flex-wrap gap-2">
          {filters.map((item) => (
            <Link
              key={item.value}
              href={href({ query, filter: item.value })}
              className={filter === item.value ? "btn-primary px-3 py-2 text-xs" : "btn-secondary px-3 py-2 text-xs"}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {pagePeople.map((person) => (
            <li key={person.slug} className="rounded-xl border border-border bg-background/55 p-3">
              <div className="mb-3 flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/persona/${person.slug}`} target="_blank" rel="noreferrer" className="block truncate font-semibold text-foreground hover:text-accent">
                    {person.name}
                  </Link>
                  <p className="mt-1 truncate text-[11px] text-muted">
                    {person.occupations.slice(0, 2).join(" · ") || person.origin || "Perfil público"}
                  </p>
                </div>
                {person.uploaded ? (
                  <Badge tone="violet">Carga Admin</Badge>
                ) : person.portraitPath ? (
                  <Badge tone="green">Editorial</Badge>
                ) : (
                  <Badge tone="amber">Pendiente</Badge>
                )}
              </div>
              <AdminPersonPortraitUploader
                slug={person.slug}
                name={person.name}
                initialPortraitPath={person.visiblePortraitPath}
              />
            </li>
          ))}
        </ul>

        {pagePeople.length === 0 && (
          <p className="py-10 text-center text-sm text-muted">No hay personas que coincidan con los filtros.</p>
        )}
        {totalPages > 1 && (
          <nav className="mt-5 flex items-center justify-center gap-2" aria-label="Paginación de retratos">
            <Link href={href({ query, filter, page: page - 1 })} aria-disabled={page === 1} className={page === 1 ? "btn-secondary pointer-events-none opacity-45" : "btn-secondary"}>Anterior</Link>
            <span className="px-2 text-sm font-semibold text-foreground">{page} / {totalPages}</span>
            <Link href={href({ query, filter, page: page + 1 })} aria-disabled={page === totalPages} className={page === totalPages ? "btn-secondary pointer-events-none opacity-45" : "btn-secondary"}>Siguiente</Link>
          </nav>
        )}
      </Panel>
    </div>
  );
}
