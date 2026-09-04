import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { buildPlatformMetadata } from "@/lib/catalog-seo";
import { NewsStrip } from "@/components/news-strip";
import { PlatformCatalogSection } from "@/components/platform-catalog-section";
import { SiteNav } from "@/components/site-nav";
import { getActiveListingCountsByCatalog } from "@/lib/listings";
import {
  CATALOG_PAGE_SIZE,
  publicFacetFilterOptions,
  publicGenreFilterOptions,
  publicSubgenreFilterOptions,
} from "@/lib/catalog-filters";
import { buildPlatformCatalogInsights } from "@/lib/platform-catalog-insights";
import { getUserCollectionViews } from "@/lib/collection-store";
import { getCatalogByPlatformWithOverlay } from "@/lib/catalog-runtime-overlay";
import { getAdminPlatform } from "@/lib/admin-entity-catalog";
import { toCatalogListGame } from "@/lib/catalog-list-game";
import { toCatalogCardGame } from "@/lib/catalog-card-game";
import { publicCatalogRegionFilterOptionsForPlatform, publicCompanyFilterOptions } from "@/lib/public-catalog-filter-options";
import { listNewsForSection } from "@/lib/news-cache";
import { platformNewsTopicForSlug } from "@/lib/news-platform-topics";
import { canViewCollectionValue } from "@/lib/plans";
import { getCurrentUser } from "@/lib/users";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ q?: string; region?: string; genre?: string; subgenre?: string; facet?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const platform = await getAdminPlatform(slug);
  if (platform?.active === false) return { title: "Plataforma no encontrada" };
  if (!platform) return { title: "Plataforma no encontrada" };
  return buildPlatformMetadata(platform);
}

function sortCatalogByTitle<T extends { title: string }>(games: T[]): T[] {
  return [...games].sort((a, b) => a.title.localeCompare(b.title, "es", { sensitivity: "base" }));
}

export default async function PlatformPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  const platform = await getAdminPlatform(slug);
  if (!platform || platform.active === false) notFound();
  const platformNewsTopic = platformNewsTopicForSlug(platform.slug);

  const [user, catalogGames, listingCounts, platformNews] = await Promise.all([
    getCurrentUser(),
    getCatalogByPlatformWithOverlay(slug),
    getActiveListingCountsByCatalog(),
    platformNewsTopic
      ? listNewsForSection({ section: "platform", topic: platformNewsTopic.topic, limit: 9 })
      : platform.newsEnabled === true
        ? listNewsForSection({ section: "platform", topic: platform.slug, limit: 9 })
        : Promise.resolve([]),
  ]);
  const owned = user ? await getUserCollectionViews(user.id) : [];
  const ownedCatalogIds = user
    ? [...new Set(owned.map((item) => item.catalogId).filter((id): id is string => Boolean(id)))]
    : [];
  const ownedOnPlatform = owned.filter((c) => c.platformSlug === slug);
  const initialGames = sortCatalogByTitle(catalogGames)
    .slice(0, CATALOG_PAGE_SIZE)
    .map(toCatalogListGame)
    .map(toCatalogCardGame);
  const platformNewsLabel = platformNewsTopic?.label ?? platform.shortName;

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        {catalogGames.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <p className="text-lg text-foreground/80">Catálogo en construcción</p>
            <p className="mt-2 text-sm text-muted">
              Aún no hay fichas catalogadas para esta plataforma.
            </p>
          </div>
        ) : (
          <>
            <NewsStrip
              eyebrow="Actualidad"
              title={`Noticias sobre ${platformNewsLabel}`}
              items={platformNews}
            />
            <PlatformCatalogSection
              platform={platform}
              games={initialGames}
              totalCatalogEntryCount={catalogGames.length}
              insights={buildPlatformCatalogInsights(catalogGames, platform.slug)}
              regions={publicCatalogRegionFilterOptionsForPlatform(platform.slug)}
              genres={publicGenreFilterOptions()}
              subgenres={publicSubgenreFilterOptions()}
              facets={publicFacetFilterOptions()}
              companies={publicCompanyFilterOptions()}
              ownedItems={owned}
              ownedCatalogIds={ownedCatalogIds}
              listingCounts={listingCounts}
              isLoggedIn={!!user}
              canViewCollectionValue={user ? canViewCollectionValue(user.plan) : false}
              initialQuery={typeof query?.q === "string" ? query.q : ""}
              initialRegion={typeof query?.region === "string" ? query.region : "all"}
              initialGenre={typeof query?.genre === "string" ? query.genre : "all"}
              initialSubgenre={typeof query?.subgenre === "string" ? query.subgenre : "all"}
              initialFacet={typeof query?.facet === "string" ? query.facet : "all"}
            />
          </>
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
