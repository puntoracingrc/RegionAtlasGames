import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CollectionToggle } from "@/components/collection-toggle";
import { ShareGameButton } from "@/components/share-game-button";
import { CatalogMarketplacePanel } from "@/components/catalog-marketplace-panel";
import { CatalogCommercialRelationsPanel } from "@/components/catalog-commercial-relations-panel";
import { GameJsonLd } from "@/components/game-json-ld";
import { GamePriceHero } from "@/components/game-price-hero";
import {
  PhysicalEditionPriceSwitcher,
  type PhysicalEditionPriceOption,
} from "@/components/physical-edition-price-switcher";
import { GamePriceHistoryChart } from "@/components/game-price-history-chart";
import { GameProductReference } from "@/components/game-product-reference";
import { Ps1EditionPanel } from "@/components/ps1-edition-panel";
import { Ps2EditionPanel } from "@/components/ps2-edition-panel";
import { OwnedScansPanel } from "@/components/owned-scans-panel";
import { CatalogEditionGuide } from "@/components/catalog-edition-guide";
import { getCatalogEditionGuide } from "@/lib/catalog-edition-guides";
import {
  catalogEbayRegionOptions,
  catalogPathWithRequestedEbayRegion,
  resolveCatalogEbayRegion,
} from "@/lib/catalog-ebay-region";
import {
  catalogPhysicalEditionOverviewRegions,
  catalogPhysicalEditionOverviewRegionLinks,
  getCatalogPhysicalEditionPublicIdentity,
} from "@/lib/catalog-physical-edition-browse";
import {
  catalogBroadRegionLabel,
  catalogMarketRegionToLegacyRegion,
  isReleasedPhysicalEdition,
} from "@/lib/catalog-edition-guide-types";
import {
  collectionItemMatchesPhysicalVariant,
  countOwnedPhysicalVariant,
} from "@/lib/catalog-physical-variant";
import { getOwnedScanSet } from "@/lib/catalog-owned-scans";
import { GameTaxonomyLinks, type GameTaxonomyLink } from "@/components/game-taxonomy-links";
import { RecordedProSalesPanel } from "@/components/recorded-pro-sales-panel";
import { SimilarGames } from "@/components/similar-games";
import { DetailCoverArt } from "@/components/detail-cover-art";
import { RegionFlag } from "@/components/region-flag";
import { SiteNav } from "@/components/site-nav";
import { Badge, DetailRow, Panel, PanelTitle } from "@/components/ui";
import {
  readUserCollection,
} from "@/lib/collection-store";
import { wishlistIdentityKey } from "@/lib/wishlist-model";
import { collectionCatalogPath } from "@/lib/collection-path";
import {
  buildBreadcrumbJsonLd,
  buildCatalogSeoSlug,
  buildGameJsonLd,
  buildGameMetadata,
  catalogGamePath,
  getSimilarGames,
} from "@/lib/catalog-seo";
import {
  getCatalogByPlatformWithOverlay,
  getCatalogGameDetailsWithOverlay,
  resolveCatalogGameWithOverlay,
} from "@/lib/catalog-runtime-overlay";
import { getCoverSrc } from "@/lib/cover-url";
import { CatalogAwards } from "@/components/award-results";
import { decodeHtmlEntities } from "@/lib/decode-html-entities";
import { getPlatform, isPublicCatalogGame } from "@/lib/catalog";
import { grailLabel, isGrailGame, isTopInSegment, topSegmentLabel } from "@/lib/game-highlight";
import { catalogPriceDisplayLabel } from "@/lib/price-display";
import {
  ORIGINAL_GAME_CONTENT_LABELS,
  resolveOriginalGameContents,
} from "@/lib/original-game-contents";
import {
  describeRegionalPackagingVariant,
  normalizeRegionalPackaging,
} from "@/lib/regional-packaging";
import { companyEntityLink, resolveGameEntityLinks } from "@/lib/entity-links";
import {
  COMPANY_CREDIT_ROLE_LABELS,
  resolveGameCompanyCredits,
} from "@/lib/company-credits";
import { getPublishedPriceHistory } from "@/lib/price-history";
import { editionPriceGame, loadCatalogPriceGames } from "@/lib/catalog-price-games";
import { allowedConditionBucketsForPlatform } from "@/lib/platform-price-condition-policy";
import { getCatalogRouteRedirect } from "@/lib/catalog-route-redirects";
import { getRegionDisplay } from "@/lib/region-display";
import { SITE_DEFAULT_URL } from "@/lib/site-brand";
import { getCurrentUser } from "@/lib/users";
import { listPublicSeriesForGame } from "@/lib/admin-series-manager";
import {
  getLegacySeriesRedirect,
} from "@/lib/franchise-system";
import {
  getPublicFranchiseRelationships,
  getPublicFranchisesForCatalogEntry,
} from "@/lib/admin-franchise-manager";
import type { FranchiseRole } from "@/lib/franchise-types";
import { findGameFacetEntityByNameOrAlias, findGameFacetEntityBySlug } from "@/lib/game-facets/taxonomy";
import {
  cleanSupportLabel,
  defaultSupportForPlatform,
  formatGameReleaseDate,
  formatPlayerCount,
} from "@/lib/game-detail-display";
import type { DetailEntity, GameCompanyCreditRole, GameVideo } from "@/lib/types";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function uniqueDetailEntities(entities: DetailEntity[]): DetailEntity[] {
  const seen = new Set<string>();
  const unique: DetailEntity[] = [];
  for (const entity of entities) {
    const key = entity.slug || entity.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entity);
  }
  return unique;
}

function taxonomyHref(entity: DetailEntity, fromCatalogId: string): string {
  const taxonomyEntity =
    findGameFacetEntityBySlug(entity.slug) ?? findGameFacetEntityByNameOrAlias(entity.name);
  const slug = taxonomyEntity?.slug ?? entity.slug;
  const pathname = taxonomyEntity?.type === "genre" ? `/genero/${slug}` : `/etiqueta/${slug}`;
  return `${pathname}?from=${encodeURIComponent(fromCatalogId)}`;
}

function taxonomyLinks(entities: DetailEntity[], fromCatalogId: string): GameTaxonomyLink[] {
  return uniqueDetailEntities(entities)
    .filter((entity) => entity.slug)
    .map((entity) => ({
      name: entity.name,
      href: taxonomyHref(entity, fromCatalogId),
    }));
}

function getYoutubeEmbedUrl(videoId: string) {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`;
}

function getYoutubeWatchUrl(video: GameVideo) {
  return video.url || `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`;
}

function franchiseRoleLabel(role: FranchiseRole): string {
  const labels: Record<FranchiseRole, string> = {
    mainline: "Serie principal",
    spin_off: "Spin-off",
    side_story: "Historia paralela",
    crossover: "Crossover",
  };
  return labels[role];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const routeRedirect = getCatalogRouteRedirect(slug);
  const game = await resolveCatalogGameWithOverlay(routeRedirect?.targetCatalogId ?? slug);
  if (!game || !isPublicCatalogGame(game)) return { title: "Juego no encontrado" };
  const platform = getPlatform(game.platformSlug);
  const details = await getCatalogGameDetailsWithOverlay(game);
  const platformCatalog = await getCatalogByPlatformWithOverlay(game.platformSlug);
  const editionGuide = getCatalogEditionGuide(game, platformCatalog);
  const physicalEditionIdentity = getCatalogPhysicalEditionPublicIdentity(
    game,
    platform?.shortName ?? game.platformSlug,
    editionGuide,
  );
  return buildGameMetadata(game, details, {
    physicalEditionIdentity,
    coverUrl: getOwnedScanSet(game)?.primaryCoverUrl,
  });
}

export default async function CatalogGamePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  const rawEbayRegion = query.ebayRegion;
  const requestedEbayRegion = Array.isArray(rawEbayRegion) ? rawEbayRegion[0] : rawEbayRegion;
  const routeRedirect = getCatalogRouteRedirect(slug);
  if (routeRedirect) {
    const target = await resolveCatalogGameWithOverlay(routeRedirect.targetCatalogId);
    if (target && isPublicCatalogGame(target)) {
      permanentRedirect(catalogPathWithRequestedEbayRegion(
        catalogGamePath(target),
        requestedEbayRegion,
      ));
    }
  }
  const game = await resolveCatalogGameWithOverlay(slug);
  if (!game || !isPublicCatalogGame(game)) notFound();

  const canonicalSlug = buildCatalogSeoSlug(game);
  if (slug !== canonicalSlug) {
    permanentRedirect(catalogPathWithRequestedEbayRegion(
      catalogGamePath(game),
      requestedEbayRegion,
    ));
  }

  const platform = getPlatform(game.platformSlug);
  const platformCatalog = await getCatalogByPlatformWithOverlay(game.platformSlug);
  const editionGuide = getCatalogEditionGuide(game, platformCatalog);
  const currentPhysicalEdition = editionGuide?.physicalEditions.find(
    (edition) => edition.id === editionGuide.currentEditionId,
  );
  const currentBonusItem = editionGuide?.physicalBonusItems.find(
    (item) => item.id === editionGuide.currentBonusItemId,
  );
  const isCanceledPhysicalRelease = currentPhysicalEdition?.releaseStatus === "CANCELED_PHYSICAL_RELEASE";
  const currentEditionFamily = editionGuide?.editionFamilies.find(
    (family) => family.id === editionGuide.currentEditionFamilyId,
  );
  const headerPhysicalEditions = currentEditionFamily
    ? editionGuide?.physicalEditions.filter(
        (edition) => currentEditionFamily.physicalEditionIds.includes(edition.id)
          && isReleasedPhysicalEdition(edition),
      ) ?? []
    : currentPhysicalEdition
      ? [currentPhysicalEdition]
      : [];
  const headerRegionLinks = editionGuide?.schemaVersion === 2 && headerPhysicalEditions.length
    ? catalogPhysicalEditionOverviewRegionLinks(headerPhysicalEditions)
    : [];
  const headerRegions = headerRegionLinks.length
    ? headerRegionLinks.map((entry) => entry.region)
    : [game.region];
  const ebayRegionOptions = editionGuide?.schemaVersion === 2 && currentEditionFamily
    ? catalogEbayRegionOptions(headerPhysicalEditions)
    : [];
  const currentEbayMarket = currentPhysicalEdition?.marketRegions.length === 1
    ? currentPhysicalEdition.marketRegions[0]
    : null;
  const initialEbayRegion = resolveCatalogEbayRegion(
    ebayRegionOptions,
    requestedEbayRegion,
    currentEbayMarket,
  );
  const physicalEditionIdentity = getCatalogPhysicalEditionPublicIdentity(
    game,
    platform?.shortName ?? game.platformSlug,
    editionGuide,
  );
  const currentPhysicalVariantId = currentPhysicalEdition?.collectionIdentity === "physical-variant"
    ? currentPhysicalEdition.id
    : undefined;
  const user = await getCurrentUser();
  const collection = user ? await readUserCollection(user.id) : null;
  const ownedItems = collection?.items.filter((item) => currentPhysicalVariantId
    ? collectionItemMatchesPhysicalVariant(item, currentPhysicalVariantId)
    : item.catalogId === game.id) ?? [];
  const ownedCount = ownedItems.reduce((total, item) => total + Math.max(1, item.quantity || 1), 0);
  const currentWishlistIdentity = wishlistIdentityKey({
    catalogId: game.id,
    ...(currentPhysicalVariantId ? { physicalVariantId: currentPhysicalVariantId } : {}),
  });
  const wished = collection?.wishlist?.some(
    (entry) => wishlistIdentityKey(entry) === currentWishlistIdentity,
  ) ?? false;
  const owned = ownedCount > 0;

  const details = await getCatalogGameDetailsWithOverlay(game);
  const entityLinks = details ? resolveGameEntityLinks(details) : null;
  const companyCreditGroups = details
    ? (
        [
          "developer",
          "originalDeveloper",
          "portDeveloper",
          "remasterDeveloper",
          "publisher",
          "originalPublisher",
          "regionalPublisher",
          "digitalPublisher",
          "physicalPublisherOrDistributor",
        ] as GameCompanyCreditRole[]
      )
        .map((role) => ({
          role,
          credits: resolveGameCompanyCredits(details).filter((credit) => credit.role === role),
        }))
        .filter((group) => group.credits.length > 0)
    : [];
  const grail = isGrailGame(game);
  const topSegment = isTopInSegment(game);
  const priceStatus = catalogPriceDisplayLabel(game);
  const ownedScans = getOwnedScanSet(game);
  const primaryCoverUrl = ownedScans?.primaryCoverUrl ?? game.coverUrl;
  const originalContentProfile = resolveOriginalGameContents(game);
  const regionalPackaging = normalizeRegionalPackaging(game.regionalPackaging);
  const showPhysicalEdition = originalContentProfile.explicit || regionalPackaging.length > 0;
  const regionLabel = getRegionDisplay(game.region).label;
  const pendingPs1 = game.platformSlug === "ps1" && game.regionalStatus === "review";
  const similar = getSimilarGames(game);
  const priceHistory = getPublishedPriceHistory(game);
  const publicSeries = (await listPublicSeriesForGame(game.id)).filter(
    (series) => !getLegacySeriesRedirect(series.slug),
  );
  const franchiseLinks = await getPublicFranchisesForCatalogEntry(game.id);
  const gameRelationships = await getPublicFranchiseRelationships({ type: "game", id: game.id });
  const youtubeVideos = (details?.videos ?? [])
    .filter((video) => video.provider === "youtube" && video.videoId)
    .slice(0, 4);
  const featuredVideo = youtubeVideos[0];
  const secondaryVideos = youtubeVideos.slice(1);
  const detailsSeries =
    details?.series &&
    !getLegacySeriesRedirect(details.series.slug) &&
    !publicSeries.some((series) => series.slug === details.series?.slug)
      ? [
          {
            slug: details.series.slug,
            name: details.series.name,
            gameCount: 0,
            matchedGameCount: 1,
            matchedGameIds: [game.id],
          },
        ]
      : [];
  const seriesLinks = [...publicSeries, ...detailsSeries];
  const subgenreEntities = details?.subgenres ?? [];
  const facetEntities = [...(details?.facets ?? []), ...(details?.tags ?? [])];
  const individualDeveloperCredits = (details?.individualCredits ?? []).filter(
    (credit) => credit.role === "developer",
  );

  const breadcrumbItems = [
    { label: "Inicio", href: "/" },
    { label: "Plataformas", href: "/plataformas" },
    ...(platform
      ? [{ label: platform.shortName, href: `/plataforma/${platform.slug}` }]
      : []),
    { label: decodeHtmlEntities(game.title) },
  ];

  const jsonLd = [
    buildGameJsonLd(game, platform, details, {
      physicalEditionIdentity,
      coverUrl: primaryCoverUrl,
    }),
    buildBreadcrumbJsonLd([
      { name: "Inicio", href: "/" },
      { name: "Plataformas", href: "/plataformas" },
      ...(platform
        ? [{ name: platform.shortName, href: `/plataforma/${platform.slug}` }]
        : []),
      { name: decodeHtmlEntities(game.title), href: catalogGamePath(game) },
    ]),
  ];

  const seoDescription =
    physicalEditionIdentity?.description ||
    details?.description?.trim() ||
    (details?.year && platform
      ? `${game.title} (${platform.shortName}, ${regionLabel}, ${details.year}) en el catálogo de Region Atlas.`
      : `${game.title} para ${platform?.shortName ?? game.platformSlug} (${regionLabel}) en Region Atlas.`);

  const coverAlt =
    physicalEditionIdentity?.coverAlt ||
    details?.seoMeta?.coverAlt?.trim() ||
    `Portada de ${game.title} para ${platform?.shortName ?? game.platformSlug} (${regionLabel})`;
  const photographedCover = details?.ps2Edition?.graphics.find(asset =>
    asset.url === game.coverUrl && asset.layout === "listing_front_photo");
  const guideRendersCurrentScans = editionGuide?.schemaVersion === 2 && Boolean(currentPhysicalEdition?.scanSetIds.includes(game.id));
  const physicalVariantActionStates = editionGuide?.editionFamilies.length
    ? Object.fromEntries(editionGuide.physicalEditions.map((edition) => {
        const family = editionGuide.editionFamilies.find((candidate) =>
          candidate.physicalEditionIds.includes(edition.id),
        );
        const collectionCatalogId = edition.catalogIds[0] ?? family?.representativeCatalogId ?? game.id;
        const editionItems = collection?.items.filter((item) => edition.collectionIdentity === "physical-variant"
          ? collectionItemMatchesPhysicalVariant(item, edition.id)
          : item.catalogId === collectionCatalogId) ?? [];
        const editionWishlistIdentity = wishlistIdentityKey({
          catalogId: collectionCatalogId,
          ...(edition.collectionIdentity === "physical-variant" ? { physicalVariantId: edition.id } : {}),
        });
        return [edition.id, {
          ownedCount: edition.collectionIdentity === "physical-variant"
            ? countOwnedPhysicalVariant(editionItems, edition.id)
            : editionItems.reduce((total, item) => total + Math.max(1, item.quantity || 1), 0),
          wished: collection?.wishlist?.some(
            (entry) => wishlistIdentityKey(entry) === editionWishlistIdentity,
          ) ?? false,
          ...(editionItems[0]?.id ? { collectionItemId: editionItems[0].id } : {}),
        }];
      }))
    : {};
  const priceEditions = editionGuide?.physicalEditions.filter(edition =>
    !currentEditionFamily || currentEditionFamily.physicalEditionIds.includes(edition.id),
  ) ?? [];
  const editionPriceIds = new Set(priceEditions.flatMap(edition => edition.catalogIds));
  const priceGames = await loadCatalogPriceGames(
    [...editionPriceIds],
    async id => {
      const linked = await resolveCatalogGameWithOverlay(id);
      return linked && isPublicCatalogGame(linked) ? linked : undefined;
    },
    [...platformCatalog.filter(candidate => editionPriceIds.has(candidate.id)), game],
  );
  const physicalEditionPriceOptions: PhysicalEditionPriceOption[] =
    editionGuide?.schemaVersion === 2 && currentEditionFamily
      ? priceEditions
        .filter(isReleasedPhysicalEdition)
        .map((edition) => {
          const linkedPriceGame = editionPriceGame(edition.catalogIds, priceGames);
          const priceGame = linkedPriceGame ?? game;
          const documentedRegions = edition.marketRegions.length
            ? edition.marketRegions.map(catalogMarketRegionToLegacyRegion)
            : catalogPhysicalEditionOverviewRegions([edition]);
          const priceRegionLabel = linkedPriceGame
            ? getRegionDisplay(linkedPriceGame.region).label
            : documentedRegions.map(region => getRegionDisplay(region).label).join(" / ");
          const priceEditionLabel = `${priceRegionLabel} · ${edition.label}`;
          const allowedPriceBuckets = allowedConditionBucketsForPlatform(
            priceGame.platformSlug,
            currentEditionFamily.priceConditions,
          );
          return {
            id: edition.id,
            label: edition.label,
            broadRegion: edition.broadRegion,
            broadRegionLabel: catalogBroadRegionLabel(edition.broadRegion),
            regions: documentedRegions,
            content: (
              <GamePriceHero
                game={priceGame}
                regionLabelOverride={priceEditionLabel}
                pendingMessage="Aún no hay suficientes ventas verificadas para esta edición."
                allowedBuckets={allowedPriceBuckets}
                forcePending={!linkedPriceGame}
              />
            ),
            history: (
              <GamePriceHistoryChart
                catalogId={linkedPriceGame?.id ?? edition.id}
                editionLabel={priceEditionLabel}
                history={linkedPriceGame ? getPublishedPriceHistory(linkedPriceGame) : []}
                allowedBuckets={allowedPriceBuckets}
              />
            ),
          };
        })
      : [];

  return (
    <>
      <GameJsonLd data={jsonLd} />
      <SiteNav />
      <main className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
        <Breadcrumbs items={breadcrumbItems} />

        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,400px)_1fr] lg:gap-10">
          <div className="space-y-4 lg:self-start">
            {pendingPs1 && !primaryCoverUrl ? (
              <Panel>
                <PanelTitle>Edición pendiente de identificar</PanelTitle>
                <p className="text-sm leading-6 text-muted">La portada de esta ficha aún no está confirmada. Consulta las ediciones documentadas y las referencias disponibles para contrastar tu ejemplar.</p>
                <a href="#ps1-edition-details" className="mt-3 inline-block text-sm font-semibold text-accent underline">Ver ediciones y referencias</a>
              </Panel>
            ) : <div>
              <DetailCoverArt
                src={getCoverSrc(primaryCoverUrl, game.id)}
                alt={coverAlt}
                platformSlug={game.platformSlug}
                owned={owned}
                grail={grail}
                topSegment={topSegment}
              />
              {photographedCover ? <p className="mt-2 text-center text-xs text-muted">Fotografía de un ejemplar</p> : null}
              {ownedScans ? <p className="mt-2 text-center text-xs text-muted">{ownedScans.primaryCaption}</p> : null}
            </div>}

            {editionGuide?.schemaVersion === 2 ? (
              <div className="flex justify-end">
                <ShareGameButton
                  title={game.title}
                  url={new URL(catalogGamePath(game), SITE_DEFAULT_URL).toString()}
                />
              </div>
            ) : (
              <CollectionToggle
                key={`${user?.id ?? "guest"}:${game.id}:${currentPhysicalVariantId ?? "legacy"}`}
                catalogId={game.id}
                physicalVariantId={currentPhysicalVariantId}
                gameTitle={game.title}
                initialOwned={owned}
                ownedCount={ownedCount}
                initialWished={wished}
                initialCollectionItemId={ownedItems[0]?.id}
                isLoggedIn={Boolean(user)}
                gamePath={catalogGamePath(game)}
                platformSlug={game.platformSlug}
              />
            )}

            {!isCanceledPhysicalRelease ? (
              <CatalogMarketplacePanel
                catalogId={game.id}
                ebayRegionOptions={ebayRegionOptions}
                initialEbayRegion={initialEbayRegion?.value}
              />
            ) : null}
          </div>

          <div className="min-w-0 space-y-5">
            <header className="space-y-2.5">
              <div className="flex flex-wrap gap-1.5">
                <Badge>{platform?.shortName}</Badge>
                {headerRegionLinks.length
                  ? headerRegionLinks.map(({ region, targetId }) => (
                    <a
                      key={`${region}:${targetId}`}
                      href={`#${targetId}`}
                      aria-label={`Ir a ${getRegionDisplay(region).label}`}
                      className="rounded-md outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      <Badge>
                        <RegionFlag region={region} size="sm" showLabel labelMode="short" />
                      </Badge>
                    </a>
                  ))
                  : headerRegions.map((region) => (
                    <Badge key={region}>
                      <RegionFlag region={region} size="sm" showLabel labelMode="short" />
                    </Badge>
                  ))}
                {isCanceledPhysicalRelease ? (
                  <Badge tone="amber">CANCELLED / NO RETAIL RELEASE</Badge>
                ) : priceStatus === "verified" ? (
                  <Badge tone="amber">Precio verificado</Badge>
                ) : priceStatus === "pending" ? (
                  <Badge tone="rose">Precio pendiente</Badge>
                ) : null}
                {owned && (
                  <Badge tone="green">
                    {ownedCount > 1 ? `${ownedCount} copias en tu colección` : "En tu colección"}
                  </Badge>
                )}
                {topSegment && <Badge tone="violet">{topSegmentLabel()}</Badge>}
                {grail && <Badge tone="amber">{grailLabel()}</Badge>}
              </div>
              <h1 className="text-2xl font-bold leading-tight text-foreground sm:text-3xl">
                {game.title}
                <span className="mt-1 block text-lg font-normal text-muted sm:text-xl">
                  {isCanceledPhysicalRelease
                    ? `${platform?.shortName} · Gold Edition · lanzamiento físico cancelado`
                    : currentBonusItem
                      ? `${platform?.shortName} · bonus físico sin juego`
                      : currentPhysicalEdition && editionGuide?.schemaVersion === 2
                        ? `${platform?.shortName} · ${currentPhysicalEdition.label}`
                        : `Precio ${platform?.shortName} · ${regionLabel}`}
                </span>
              </h1>
              {game.titlePc && game.titlePc !== game.title && (
                <p className="text-sm text-muted">Título alternativo: {game.titlePc}</p>
              )}
            </header>

            {pendingPs1 ? <div id="ps1-edition-details" className="scroll-mt-24"><Ps1EditionPanel game={game} details={details} /></div> : null}

            {isCanceledPhysicalRelease ? (
              <Panel>
                <PanelTitle>Lanzamiento físico cancelado</PanelTitle>
                <p className="text-sm leading-6 text-muted">
                  Esta Gold Edition no llegó a publicarse en formato físico. No se muestran precios CIB/new ni se contabiliza como edición retail lanzada.
                </p>
              </Panel>
            ) : physicalEditionPriceOptions.length ? (
              <PhysicalEditionPriceSwitcher
                key={`${editionGuide?.id}:${currentEditionFamily?.id}:${currentPhysicalEdition?.id}`}
                options={physicalEditionPriceOptions}
                initialEditionId={currentPhysicalEdition?.id}
              />
            ) : (
              <GamePriceHero
                game={game}
                regionLabelOverride={regionLabel}
                allowedBuckets={allowedConditionBucketsForPlatform(game.platformSlug)}
                pendingMessage={physicalEditionIdentity
                  ? "Aún no hay suficientes ventas verificadas para esta edición."
                  : undefined}
              />
            )}

            {!isCanceledPhysicalRelease && !physicalEditionPriceOptions.length && (
              <GamePriceHistoryChart
                catalogId={game.id}
                editionLabel={regionLabel}
                history={priceHistory}
                allowedBuckets={allowedConditionBucketsForPlatform(game.platformSlug)}
              />
            )}

            {currentPhysicalEdition?.collectionIdentity !== "physical-variant"
              ? <GameProductReference game={game} details={details} />
              : null}

            {!pendingPs1 ? <Ps1EditionPanel game={game} details={details} /> : null}
            <Ps2EditionPanel game={game} details={details} />
            {!guideRendersCurrentScans ? <OwnedScansPanel scans={ownedScans} title={game.title} /> : null}
            <CatalogEditionGuide
              game={game}
              guide={editionGuide}
              isLoggedIn={Boolean(user)}
              physicalVariantActionStates={physicalVariantActionStates}
              priceGames={priceGames}
            />

            <CatalogCommercialRelationsPanel catalogId={game.id} />

            {showPhysicalEdition && (
              <Panel>
                <PanelTitle>Edición física</PanelTitle>
                <dl className="space-y-4 text-sm leading-6">
                  {originalContentProfile.explicit && (
                    <div>
                      <dt className="font-semibold text-foreground">Contenido de fábrica</dt>
                      <dd className="text-muted">
                        {originalContentProfile.contents.length > 0
                          ? `Caja · Juego · ${originalContentProfile.contents
                              .map((content) => ORIGINAL_GAME_CONTENT_LABELS[content])
                              .join(" · ")}`
                          : "Caja y juego. No incluía manual ni otros extras de fábrica."}
                      </dd>
                    </div>
                  )}
                  {regionalPackaging.map((variant) => (
                    <div key={variant.region}>
                      <dt className="font-semibold text-foreground">{variant.region}</dt>
                      <dd className="text-muted">
                        {describeRegionalPackagingVariant(variant)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            )}


            {user && owned && (
              <Panel>
                <PanelTitle>Tu colección</PanelTitle>
                <p className="text-sm text-muted">
                  Tienes {ownedCount} {ownedCount === 1 ? "unidad" : "unidades"}. Edita el
                  estado, las fechas y el coste o elige qué copia quieres poner en venta.
                </p>
                <Link
                  href={collectionCatalogPath(game.id)}
                  className="btn-primary mt-4 inline-flex"
                >
                  Gestionar mis copias
                </Link>
              </Panel>
            )}

            <RecordedProSalesPanel catalogId={game.id} />

            {featuredVideo && (
              <Panel>
                <PanelTitle>Vídeos oficiales</PanelTitle>
                <div className="space-y-3">
                  <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
                    <iframe
                      src={getYoutubeEmbedUrl(featuredVideo.videoId)}
                      title={featuredVideo.title}
                      className="aspect-video w-full"
                      loading="lazy"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{featuredVideo.title}</p>
                    {featuredVideo.channelTitle && (
                      <p className="text-xs text-muted">
                        Fuente:{" "}
                        {featuredVideo.channelUrl ? (
                          <Link href={featuredVideo.channelUrl} className="text-accent hover:underline">
                            {featuredVideo.channelTitle}
                          </Link>
                        ) : (
                          featuredVideo.channelTitle
                        )}
                      </p>
                    )}
                  </div>
                  {secondaryVideos.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-3">
                      {secondaryVideos.map((video) => (
                        <Link
                          key={video.videoId}
                          href={getYoutubeWatchUrl(video)}
                          className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-muted hover:bg-white/10"
                        >
                          <span className="line-clamp-2 font-medium text-foreground">{video.title}</span>
                          {video.channelTitle && (
                            <span className="mt-1 block text-xs text-muted">{video.channelTitle}</span>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </Panel>
            )}

            <Panel>
              <PanelTitle>Descripción</PanelTitle>
              <div className="space-y-3 text-sm leading-relaxed text-muted">
                {editionGuide?.schemaVersion === 2 && details?.description ? (
                  details.description.split(/\n{2,}/).map((paragraph) => (
                    <p key={paragraph.slice(0, 40)}>{paragraph.trim()}</p>
                  ))
                ) : physicalEditionIdentity ? (
                  <p>{physicalEditionIdentity.description}</p>
                ) : details?.description ? (
                  details.description.split(/\n{2,}/).map((paragraph) => (
                    <p key={paragraph.slice(0, 40)}>{paragraph.trim()}</p>
                  ))
                ) : (
                  <p>{seoDescription}</p>
                )}
              </div>
              {details?.seoMeta?.highlights && details.seoMeta.highlights.length > 0 && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
                  {details.seoMeta.highlights.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </Panel>

            <CatalogAwards catalogId={game.id} />

            {details && (
              <Panel>
                <PanelTitle>Detalles del juego</PanelTitle>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <DetailRow label="Año" value={details.year ? String(details.year) : "—"} />
                  <DetailRow label="Lanzamiento" value={formatGameReleaseDate(details.releaseDate)} />
                  <DetailRow
                    label="Soporte"
                    value={cleanSupportLabel(details.support) || defaultSupportForPlatform(game.platformSlug) || "—"}
                  />
                  <DetailRow
                    label="Jugadores"
                    value={formatPlayerCount(details.players)}
                  />
                  {companyCreditGroups.map((group) => (
                    <DetailRow
                      key={group.role}
                      label={COMPANY_CREDIT_ROLE_LABELS[group.role]}
                      value={
                        <span className="flex flex-wrap gap-x-2 gap-y-1">
                          {group.credits.map((credit, index) => {
                            const link = companyEntityLink(credit.company);
                            return (
                              <span key={`${group.role}:${credit.company.slug}`}>
                                {index > 0 && <span className="mr-2 text-muted">·</span>}
                                {link ? (
                                  <Link href={link.href} className="text-accent hover:underline">
                                    {link.name}
                                  </Link>
                                ) : (
                                  credit.company.name
                                )}
                              </span>
                            );
                          })}
                        </span>
                      }
                    />
                  ))}
                  {individualDeveloperCredits.length > 0 && (
                    <DetailRow
                      label="Desarrollo individual"
                      value={individualDeveloperCredits
                        .map((credit) => credit.person.name)
                        .join(" · ")}
                    />
                  )}
                  <DetailRow
                    label="Géneros"
                    value={
                      entityLinks && entityLinks.genres.length > 0 ? (
                        <GameTaxonomyLinks
                          links={entityLinks.genres.map((genre) => ({
                            name: genre.name,
                            href: `${genre.href}?from=${encodeURIComponent(game.id)}`,
                          }))}
                        />
                      ) : (
                        "—"
                      )
                    }
                  />
                  {(subgenreEntities.length > 0 || facetEntities.length > 0) && (
                    <>
                      <DetailRow
                        label="Subgéneros"
                        value={<GameTaxonomyLinks links={taxonomyLinks(subgenreEntities, game.id)} />}
                      />
                      <DetailRow
                        label="Facetas"
                        value={
                          <GameTaxonomyLinks
                            links={taxonomyLinks(facetEntities, game.id)}
                            maxInline={5}
                            modalTitle={`Facetas de ${game.title}`}
                          />
                        }
                      />
                    </>
                  )}
                  {franchiseLinks.length > 0 && (
                    <DetailRow
                      label={franchiseLinks.length === 1 ? "Franquicia" : "Franquicias"}
                      value={
                        <span className="flex flex-wrap gap-1.5">
                          {franchiseLinks.map((franchise) => (
                            <Link
                              key={franchise.id}
                              href={`/franquicia/${franchise.slug}`}
                              className="rounded-md bg-white/10 px-2 py-0.5 text-xs text-accent/90 hover:bg-white/15"
                            >
                              {franchise.name}
                            </Link>
                          ))}
                        </span>
                      }
                    />
                  )}
                  {seriesLinks.length > 0 && (
                    <DetailRow
                      label={seriesLinks.length === 1 ? "Saga" : "Sagas"}
                      value={
                        <span className="flex flex-wrap gap-1.5">
                          {seriesLinks.map((series) => (
                            <Link
                              key={series.slug}
                              href={`/saga/${series.slug}`}
                              className="rounded-md bg-white/10 px-2 py-0.5 text-xs text-accent/90 hover:bg-white/15"
                            >
                              {series.name}
                            </Link>
                          ))}
                        </span>
                      }
                    />
                  )}
                  {franchiseLinks.some((franchise) => franchise.role) && (
                    <DetailRow
                      label="Rol"
                      value={franchiseLinks
                        .filter((franchise) => franchise.role)
                        .map((franchise) => `${franchiseRoleLabel(franchise.role!)} · ${franchise.name}`)
                        .join(" · ")}
                    />
                  )}
                  {gameRelationships.length > 0 && (
                    <DetailRow
                      label="Relaciones"
                      value={
                        <span className="flex flex-wrap gap-x-3 gap-y-1">
                          {gameRelationships.map((relationship) => (
                            <span key={relationship.id} className="text-xs text-muted">
                              {relationship.label}{" "}
                              <Link href={relationship.href} className="font-semibold text-accent hover:underline">
                                {relationship.entityName}
                              </Link>
                            </span>
                          ))}
                        </span>
                      }
                    />
                  )}
                </dl>
              </Panel>
            )}

            <SimilarGames games={similar} />
          </div>
        </div>
      </main>
    </>
  );
}
