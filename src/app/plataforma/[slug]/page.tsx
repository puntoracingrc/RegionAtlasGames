import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { buildPlatformMetadata } from "@/lib/catalog-seo";
import { CatalogBrowser } from "@/components/catalog-browser";
import { PlatformHero } from "@/components/platform-hero";
import { SiteNav } from "@/components/site-nav";
import { getActiveListingCountsByCatalog } from "@/lib/listings";
import { getOwnedCatalogIds, getUserCollectionViews } from "@/lib/collection-store";
import { getCatalogByPlatform, getPlatform } from "@/lib/catalog";
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
  const catalogGames = getCatalogByPlatform(slug);
  const listingCounts = getActiveListingCountsByCatalog();

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <PlatformHero platform={platform} games={catalogGames} ownedItems={owned} />

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
            compactLegends
          />
        )}

        {ownedOnPlatform.length > 0 && (
          <section className="mt-12 rounded-xl border border-border bg-card/50 p-5">
            <h2 className="text-lg font-semibold text-foreground">
              En tu colección · {ownedOnPlatform.length}
            </h2>
            <Link href="/coleccion" className="mt-2 inline-block text-sm text-accent hover:underline">
              Ver colección completa →
            </Link>
          </section>
        )}
      </main>
    </>
  );
}
