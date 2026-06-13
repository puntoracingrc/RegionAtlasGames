import Link from "next/link";
import { PlatformGrid } from "@/components/platform-card";
import { SiteNav } from "@/components/site-nav";
import {
  getUserCollectionViews,
  readUserCollection,
  summarizeCollectionForPlan,
} from "@/lib/collection-store";
import { formatEur, meta, platforms } from "@/lib/catalog";
import { indexStats } from "@/lib/indexes";
import { canViewCollectionValue } from "@/lib/plans";
import { SITE_LOGO } from "@/lib/site-brand";
import { getCurrentUser } from "@/lib/users";

export default async function HomePage() {
  const user = await getCurrentUser();
  const ownedItems = user ? getUserCollectionViews(user.id) : [];
  const userSummary = user
    ? summarizeCollectionForPlan(readUserCollection(user.id).items, user.plan)
    : null;
  const showCollectionValue = user ? canViewCollectionValue(user.plan) : false;
  const indexes = indexStats();

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <header className="mb-10 space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent">
            Catálogo por región · Precios en España
          </div>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">
                {SITE_LOGO}
              </h1>
              <p className="text-base leading-relaxed text-muted">
                El catálogo de referencia para coleccionistas: juegos oficiales por consola y
                región, con fichas enriquecidas, búsqueda por compañía, género o SKU, y estimaciones
                de venta basadas en el mercado español.
              </p>
              <p className="text-sm text-muted/90">
                NES a PS4 · PAL, USA y Japón ·{" "}
                {meta.catalogListed.toLocaleString("es-ES")} juegos indexados
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link href="/plataformas" className="btn-primary">
                Explorar catálogo
              </Link>
              <Link href="/coleccion" className="btn-secondary">
                Mi colección
              </Link>
            </div>
          </div>
        </header>

        <section className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Plataformas" value={String(meta.platformCount)} hint="Consolas retro indexadas" />
          <Stat
            label="Juegos en catálogo"
            value={meta.catalogListed.toLocaleString("es-ES")}
            hint="Títulos indexados por plataforma y región"
          />
          <Stat
            label="Compañías y géneros"
            value={`${indexes.companies} · ${indexes.genres}`}
            hint="Índices cruzados navegables"
          />
          <Stat
            label={userSummary ? "Tu colección" : "Mi colección"}
            value={
              userSummary
                ? showCollectionValue
                  ? formatEur(userSummary.totalRecommendedValue)
                  : String(userSummary.totalItems)
                : "Importa Excel"
            }
            hint={
              userSummary
                ? showCollectionValue
                  ? `${userSummary.totalItems} juegos importados`
                  : `${userSummary.totalItems} juegos · valor total con Pro`
                : "Regístrate e importa tu inventario"
            }
          />
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Plataformas</h2>
              <p className="mt-1 text-sm text-muted">
                Accede al listado completo, filtra por región y ordena por año, precio o referencia.
              </p>
            </div>
            <Link href="/plataformas" className="text-sm text-accent hover:underline">
              Ver todas →
            </Link>
          </div>
          <PlatformGrid items={platforms} ownedItems={ownedItems} />
        </section>
      </main>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold text-accent">{value}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </article>
  );
}
