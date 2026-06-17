import Link from "next/link";
import { HomeCatalogSearch } from "@/components/home-catalog-search";
import { PlatformGrid } from "@/components/platform-card";
import { SiteNav } from "@/components/site-nav";
import {
  getUserCollectionViews,
  readUserCollection,
  summarizeCollectionForPlan,
} from "@/lib/collection-store";
import { listedCatalog, meta } from "@/lib/catalog";
import { listAdminPlatforms } from "@/lib/admin-entity-catalog";
import { formatEur } from "@/lib/price-format";
import { getGameDetails, indexStats } from "@/lib/indexes";
import { canViewCollectionValue } from "@/lib/plans";
import { regionBarColorForLabel, regionSortRank } from "@/lib/platform-catalog-insights";
import { getRegionDisplay } from "@/lib/region-display";
import { SITE_LOGO } from "@/lib/site-brand";
import { getCurrentUser } from "@/lib/users";

export default async function HomePage() {
  const user = await getCurrentUser();
  const ownedItems = user ? await getUserCollectionViews(user.id) : [];
  const userSummary = user
    ? summarizeCollectionForPlan((await readUserCollection(user.id)).items, user.plan)
    : null;
  const showCollectionValue = user ? canViewCollectionValue(user.plan) : false;
  const indexes = indexStats();
  const atlasStats = buildAtlasPanelStats();
  const activePlatforms = (await listAdminPlatforms()).filter((platform) => platform.active !== false);
  const searchPlatforms = activePlatforms.map((platform) => ({
    slug: platform.slug,
    name: platform.name,
    shortName: platform.shortName,
  }));
  const searchRegions = buildHomeRegionOptions();
  const platformRange =
    activePlatforms.length > 1
      ? `${activePlatforms[0].shortName} a ${activePlatforms.at(-1)?.shortName}`
      : (activePlatforms[0]?.shortName ?? "Catálogo");

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-6 md:px-6 md:py-8">
        <header className="relative mb-10 overflow-hidden rounded-2xl border border-border bg-card/70 px-4 py-5 shadow-2xl shadow-slate-950/5 backdrop-blur md:px-7 md:py-7 dark:shadow-black/25">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgb(217_119_6/0.16),transparent_36%),linear-gradient(90deg,rgb(15_23_42/0.08)_1px,transparent_1px),linear-gradient(0deg,rgb(15_23_42/0.06)_1px,transparent_1px)] bg-[size:auto,44px_44px,44px_44px] dark:bg-[linear-gradient(135deg,rgb(251_191_36/0.14),transparent_36%),linear-gradient(90deg,rgb(255_255_255/0.06)_1px,transparent_1px),linear-gradient(0deg,rgb(255_255_255/0.04)_1px,transparent_1px)]" />
          <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
            <div className="max-w-3xl space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent">
                Catálogo por región · Precios en España
              </div>
              <div className="space-y-3">
                <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-foreground md:text-6xl">
                  {SITE_LOGO}
                </h1>
                <p className="max-w-2xl text-base leading-relaxed text-muted md:text-lg">
                  El atlas para coleccionistas: juegos oficiales por consola y región, fichas
                  enriquecidas, búsqueda por compañía, género o SKU, y referencias de precio
                  españolas conforme se verifican.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link href="/plataformas" className="btn-primary min-h-11 px-5">
                  Explorar catálogo
                </Link>
                <Link href="/coleccion" className="btn-secondary min-h-11 px-5">
                  Mi colección
                </Link>
              </div>
              <p className="text-sm font-medium text-muted/90">
                {platformRange} · PAL, NTSC USA y NTSC-J Japón ·{" "}
                {meta.catalogListed.toLocaleString("es-ES")} juegos indexados
              </p>
            </div>
            <HeroAtlasPanel stats={atlasStats} />
          </div>
        </header>

        <HomeCatalogSearch platforms={searchPlatforms} regions={searchRegions} />

        <section className="mb-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Plataformas" value={String(activePlatforms.length)} hint="Consolas activas en catálogo" />
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
          <PlatformGrid items={activePlatforms} ownedItems={ownedItems} />
        </section>
      </main>
    </>
  );
}

function buildHomeRegionOptions() {
  const counts = new Map<string, number>();
  for (const game of listedCatalog) {
    const label = getRegionDisplay(game.region).label;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => {
      const rankDiff = regionSortRank(a[0]) - regionSortRank(b[0]);
      if (rankDiff !== 0) return rankDiff;
      return b[1] - a[1] || a[0].localeCompare(b[0], "es");
    })
    .map(([label, count]) => ({ value: label, label, count }));
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="rounded-lg border border-border/70 bg-card/70 px-4 py-3 shadow-sm shadow-slate-950/5 transition hover:-translate-y-0.5 hover:bg-card-hover">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold text-accent/95">{value}</p>
      {hint && <p className="mt-1 text-xs leading-snug text-muted/85">{hint}</p>}
    </article>
  );
}

type HeroRegionStat = {
  label: string;
  count: number;
  pct: number;
  color: string;
};

type HeroMetric = {
  label: string;
  value: string;
};

type HeroAtlasStats = {
  total: number;
  regions: HeroRegionStat[];
  metrics: HeroMetric[];
};

function buildAtlasPanelStats(): HeroAtlasStats {
  const regionCounts = new Map<string, number>();
  let detailCount = 0;
  let priceCount = 0;
  let verifiedPriceCount = 0;

  for (const game of listedCatalog) {
    const region = getRegionDisplay(game.region).label;
    regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
    if (getGameDetails(game.id)) detailCount += 1;
    if (game.hasEsPrice || game.recommendedPrice != null) priceCount += 1;
    if (game.priceRegionVerified) verifiedPriceCount += 1;
  }

  const total = listedCatalog.length;
  let restColorIndex = 0;
  const regions = [...regionCounts.entries()]
    .sort((a, b) => {
      const rankDiff = regionSortRank(a[0]) - regionSortRank(b[0]);
      if (rankDiff !== 0) return rankDiff;
      return b[1] - a[1] || a[0].localeCompare(b[0], "es");
    })
    .slice(0, 4)
    .map(([label, count]) => {
      const rank = regionSortRank(label);
      const color =
        rank < 4 ? regionBarColorForLabel(label) : regionBarColorForLabel(label, restColorIndex++);
      return {
        label,
        count,
        pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
        color,
      };
    });

  return {
    total,
    regions,
    metrics: [
      { label: "Fichas", value: detailCount.toLocaleString("es-ES") },
      { label: "Precios ES", value: priceCount.toLocaleString("es-ES") },
      { label: "Verificados", value: verifiedPriceCount.toLocaleString("es-ES") },
    ],
  };
}

function HeroAtlasPanel({ stats }: { stats: HeroAtlasStats }) {
  return (
    <aside className="rounded-xl border border-border/70 bg-background/65 p-4 shadow-xl shadow-slate-950/10 backdrop-blur dark:shadow-black/30">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Cobertura real</p>
        <p className="rounded-full border border-accent/20 bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent">
          {stats.total.toLocaleString("es-ES")} juegos
        </p>
      </div>
      <div className="mt-5 space-y-4">
        {stats.regions.map((region) => (
          <div key={region.label}>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">{region.label}</span>
              <span className="text-muted">
                {region.count.toLocaleString("es-ES")} · {region.pct}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
              <div
                className={`h-full rounded-full ${region.color}`}
                style={{ width: `${Math.max(region.pct, 1)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2 text-center">
        {stats.metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border border-border/60 bg-card/70 px-2 py-2">
            <p className="text-[11px] font-semibold text-foreground">{metric.value}</p>
            <p className="mt-0.5 text-[10px] text-muted">{metric.label}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}
