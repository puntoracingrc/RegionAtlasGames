import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { buildPlatformMetadata } from "@/lib/catalog-seo";
import { CatalogBrowser } from "@/components/catalog-browser";
import { PlatformPriceSyncBanner } from "@/components/platform-price-sync-banner";
import { PriceLegend } from "@/components/price-legend";
import { SiteNav } from "@/components/site-nav";
import { getActiveListingCountsByCatalog } from "@/lib/listings";
import { getOwnedCatalogIds, getUserCollectionViews } from "@/lib/collection-store";
import {
  formatEur,
  getCatalogByPlatform,
  getPlatform,
  getPlatformStats,
} from "@/lib/catalog";
import { getCurrentUser } from "@/lib/users";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const platform = getPlatform(slug);
  if (!platform) return { title: "Plataforma no encontrada" };
  return buildPlatformMetadata(platform);
}

export default async function PlatformPage({ params }: Props) {
  const { slug } = await params;
  const platform = getPlatform(slug);
  if (!platform) notFound();

  const user = await getCurrentUser();
  const owned = user ? getUserCollectionViews(user.id) : [];
  const ownedCatalogIds = user ? getOwnedCatalogIds(user.id) : [];
  const ownedOnPlatform = owned.filter((c) => c.platformSlug === slug);
  const stats = getPlatformStats(slug, owned);
  const catalogGames = getCatalogByPlatform(slug);
  const listingCounts = getActiveListingCountsByCatalog();

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <Link href="/plataformas" className="text-sm text-muted hover:text-accent">
          ← Plataformas
        </Link>

        <header className="mt-4 mb-8 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs uppercase text-foreground/80">
              {platform.manufacturer}
            </span>
          </div>
          <h1 className="text-4xl font-bold text-foreground">{platform.name}</h1>
          <p className="max-w-2xl text-muted">{platform.description}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <MiniStat
              label="Títulos en catálogo"
              value={stats.listed.toLocaleString("es-ES")}
            />
            <MiniStat label="En tu colección" value={String(ownedOnPlatform.length)} />
          </div>

          <PlatformPriceSyncBanner platformSlug={slug} />
          <PriceLegend />
        </header>

        {catalogGames.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <p className="text-lg text-foreground/80">Catálogo en construcción</p>
            <p className="mt-2 text-sm text-muted">
              Aún no hay juegos indexados para esta plataforma.
            </p>
          </div>
        ) : (
          <CatalogBrowser
            games={catalogGames}
            contextName={platform.shortName}
            showRegionFilter
            ownedCatalogIds={ownedCatalogIds}
            listingCounts={listingCounts}
            isLoggedIn={!!user}
          />
        )}

        {ownedOnPlatform.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-4 text-xl font-semibold text-foreground">
              En tu colección ({ownedOnPlatform.length})
            </h2>
            <p className="mb-4 text-sm text-muted">
              Valor estimado:{" "}
              {formatEur(ownedOnPlatform.reduce((s, g) => s + (g.totalValue || 0), 0))}
            </p>
            <Link href="/coleccion" className="text-sm text-accent hover:underline">
              Ver colección completa →
            </Link>
          </section>
        )}
      </main>
    </>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 text-lg font-bold text-accent">{value}</p>
    </div>
  );
}
