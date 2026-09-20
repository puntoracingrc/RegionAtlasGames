import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, History } from "lucide-react";
import { buildPlatformMetadata } from "@/lib/catalog-seo";
import { NewsStrip } from "@/components/news-strip";
import { PlatformCatalogSection } from "@/components/platform-catalog-section";
import { BackLink } from "@/components/breadcrumbs";
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import { PlatformHeroArt } from "@/components/platform-card-art";
import { SiteNav } from "@/components/site-nav";
import { getActiveListingCountsByCatalog } from "@/lib/listings";
import {
  CATALOG_PAGE_SIZE,
  DEFAULT_SORT,
  filterCatalogGames,
  publicFacetFilterOptions,
  publicGenreFilterOptions,
  publicSubgenreFilterOptions,
  sortCatalogListGames,
} from "@/lib/catalog-filters";
import { buildPlatformCatalogInsights } from "@/lib/platform-catalog-insights";
import { getUserCollectionViews } from "@/lib/collection-store";
import { getCatalogByPlatformWithOverlay, loadCatalogOverlayIndex } from "@/lib/catalog-runtime-overlay";
import { getAdminPlatform } from "@/lib/admin-entity-catalog";
import { enrichCatalogCards, toRegionalCatalogCardGames, withRegionalCatalogPriceSource } from "@/lib/catalog-card-enrichment";
import { toCatalogListGameShell } from "@/lib/catalog-list-game-shell";
import { getDefaultPlatformInitialPage } from "@/lib/public-catalog-initial-page";
import { publicCatalogRegionFilterOptionsForPlatform, publicCompanyFilterOptions } from "@/lib/public-catalog-filter-options";
import { listNewsForSection } from "@/lib/news-cache";
import { platformNewsTopicForSlug } from "@/lib/news-platform-topics";
import { canViewCollectionValue } from "@/lib/plans";
import { getCurrentUser } from "@/lib/users";
import { catalogReviewCounts, isDefaultCatalogGame, isGroupedCatalogName, parsePendingEdition } from "@/lib/catalog-review-policy";
import { catalogPhysicalFilterOptions, groupCatalogListGames } from "@/lib/catalog-physical-edition-browse";
import { getPlatformHistory, parsePlatformHardwareGroup, platformHistoryPath } from "@/lib/platform-history";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ q?: string; region?: string; genre?: string; subgenre?: string; facet?: string; includePending?: string; pendingEdition?: string; hardware?: string }>;
};

function PlatformHistoryLink({ title, href }: { title: string; href: string }) {
  return (
    <section id="historia" className="scroll-mt-24 border-y border-border/70 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-accent">
            <History aria-hidden className="h-4 w-4" />
            Archivo editorial
          </div>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Historia de {title}</h2>
        </div>
        <Link
          href={href}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-3.5 text-sm font-semibold text-foreground transition hover:border-accent/40 hover:bg-card-hover"
        >
          Abrir en Industria
          <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const platform = await getAdminPlatform(slug);
  if (platform?.active === false) return { title: "Plataforma no encontrada" };
  if (!platform) return { title: "Plataforma no encontrada" };
  return buildPlatformMetadata(platform);
}

export default async function PlatformPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  const platform = await getAdminPlatform(slug);
  if (!platform || platform.active === false) notFound();
  const platformNewsTopic = platformNewsTopicForSlug(platform.slug);

  const [user, catalogGames, listingCounts, platformNews, overlayIndex] = await Promise.all([
    getCurrentUser(),
    getCatalogByPlatformWithOverlay(slug),
    getActiveListingCountsByCatalog(),
    platformNewsTopic
      ? listNewsForSection({ section: "platform", topic: platformNewsTopic.topic, limit: 9 })
      : platform.newsEnabled === true
        ? listNewsForSection({ section: "platform", topic: platform.slug, limit: 9 })
        : Promise.resolve([]),
    loadCatalogOverlayIndex(),
  ]);
  const owned = user ? await getUserCollectionViews(user.id) : [];
  const ownedCatalogIds = user
    ? [...new Set(owned.map((item) => item.catalogId).filter((id): id is string => Boolean(id)))]
    : [];
  const ownedOnPlatform = owned.filter((c) => c.platformSlug === slug);
  const includePending = query?.includePending === "1";
  const pendingEdition = parsePendingEdition(query?.pendingEdition);
  const browseGames = catalogGames.filter((game) => !isGroupedCatalogName(game));
  const initialFilters = { q: query?.q ?? "", region: query?.region ?? "all", genre: query?.genre ?? "all", subgenre: query?.subgenre ?? "all", facet: query?.facet ?? "all", platform: "all", sort: DEFAULT_SORT, priceFilter: "all" as const, queryScope: "game" as const, includePending, pendingEdition };
  const hasInitialFilters = includePending || Boolean(query?.q || query?.region || query?.genre || query?.subgenre || query?.facet);
  const useRuntimeInitialPage = hasInitialFilters || Boolean(overlayIndex.byPlatform[slug]?.length);
  const initialPage = useRuntimeInitialPage
    ? await (async () => {
      const needsEditorialIndex = Boolean(query?.q || query?.genre || query?.subgenre || query?.facet);
      const toListGame = needsEditorialIndex
        ? await import("@/lib/catalog-editorial-filter-index").then((editorialIndex) =>
          query?.q ? editorialIndex.toCatalogEditorialListGame : editorialIndex.toCatalogEditorialFilterGame)
        : toCatalogListGameShell;
      const groupedListGames = groupCatalogListGames(catalogGames.map(toListGame), {
        mergeSearchMetadata: needsEditorialIndex,
        mergeSearchText: Boolean(query?.q),
      });
      const initialResult = hasInitialFilters
        ? filterCatalogGames(groupedListGames, initialFilters, {
          mapRegionalPriceSource: (game) => withRegionalCatalogPriceSource(game, initialFilters.region, false),
        })
        : null;
      const defaultGames = groupedListGames.filter(isDefaultCatalogGame);
      const pageItems = initialResult
        ? initialResult.items.slice(0, CATALOG_PAGE_SIZE)
        : sortCatalogListGames(defaultGames, "title-asc").slice(0, CATALOG_PAGE_SIZE);
      return {
        games: needsEditorialIndex
          ? toRegionalCatalogCardGames(pageItems, initialFilters.region)
          : await enrichCatalogCards(pageItems, initialFilters.region),
        total: initialResult?.total ?? defaultGames.length,
        reviewCounts: initialResult?.reviewCounts ?? catalogReviewCounts(catalogGames),
      };
    })()
    : await getDefaultPlatformInitialPage(slug).then((page) => ({
      games: page.items,
      total: page.total,
      reviewCounts: page.reviewCounts,
    }));
  const platformNewsLabel = platformNewsTopic?.label ?? platform.shortName;
  const platformHistory = getPlatformHistory(platform.slug);
  const initialHardwareGroup = parsePlatformHardwareGroup(query?.hardware);
  const historyHref = platformHistory
    ? platformHistoryPath(platform.slug, { hardware: initialHardwareGroup })
    : null;

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        {catalogGames.length === 0 ? (
          <>
            <header className="mb-8 space-y-4">
              <BackLink href="/plataformas">Plataformas</BackLink>
              <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <PlatformHeroArt platform={platform} />
                <div className="relative z-10 space-y-3 p-5 md:p-7">
                  <ManufacturerLogo manufacturer={platform.manufacturer} />
                  <h1 className="text-3xl font-bold text-foreground md:text-4xl">
                    {platform.name}
                  </h1>
                  <p className="max-w-xl text-sm leading-relaxed text-muted">
                    {platform.description}
                  </p>
                </div>
              </div>
            </header>
            <div className="flex flex-col gap-1 border-y border-border/70 py-4 sm:flex-row sm:items-baseline sm:justify-between">
              <p className="font-medium text-foreground/80">Catálogo en construcción</p>
              <p className="text-sm text-muted">Aún no hay fichas catalogadas para esta plataforma.</p>
            </div>
            {platformHistory && historyHref ? (
              <div className="mt-8">
                <PlatformHistoryLink title={platformHistory.title} href={historyHref} />
              </div>
            ) : null}
          </>
        ) : (
          <>
            <NewsStrip
              eyebrow="Actualidad"
              title={`Noticias sobre ${platformNewsLabel}`}
              items={platformNews}
            />
            <PlatformCatalogSection
              platform={platform}
              games={initialPage.games}
              totalCatalogEntryCount={initialPage.total}
              reviewCounts={initialPage.reviewCounts}
              insights={buildPlatformCatalogInsights(browseGames, platform.slug)}
              regions={publicCatalogRegionFilterOptionsForPlatform(platform.slug)}
              genres={publicGenreFilterOptions()}
              subgenres={publicSubgenreFilterOptions()}
              facets={publicFacetFilterOptions()}
              companies={publicCompanyFilterOptions()}
              physicalEditionFilters={catalogPhysicalFilterOptions(platform.slug)}
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
              initialIncludePending={includePending}
              initialPendingEdition={pendingEdition}
            >
              {platformHistory && historyHref ? (
                <PlatformHistoryLink title={platformHistory.title} href={historyHref} />
              ) : null}
            </PlatformCatalogSection>
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
