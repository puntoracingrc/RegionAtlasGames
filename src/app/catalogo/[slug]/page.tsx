import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CollectionToggle } from "@/components/collection-toggle";
import { CatalogMarketplacePanel } from "@/components/catalog-marketplace-panel";
import { GameFaq } from "@/components/game-faq";
import { GameJsonLd } from "@/components/game-json-ld";
import { GamePriceHero } from "@/components/game-price-hero";
import { GamePriceHistoryChart } from "@/components/game-price-history-chart";
import { GameProductReference } from "@/components/game-product-reference";
import { GameTaxonomyLinks, type GameTaxonomyLink } from "@/components/game-taxonomy-links";
import { RecordedProSalesPanel } from "@/components/recorded-pro-sales-panel";
import { SimilarGames } from "@/components/similar-games";
import { DetailCoverArt } from "@/components/detail-cover-art";
import { RegionFlag } from "@/components/region-flag";
import { SiteNav } from "@/components/site-nav";
import { Badge, DetailRow, Panel, PanelTitle } from "@/components/ui";
import {
  countCatalogGameOwned,
} from "@/lib/collection-store";
import { collectionCatalogPath } from "@/lib/collection-path";
import {
  buildBreadcrumbJsonLd,
  buildCatalogSeoSlug,
  buildFaqJsonLd,
  buildGameFaq,
  buildGameJsonLd,
  buildGameMetadata,
  catalogGamePath,
  getSimilarGames,
} from "@/lib/catalog-seo";
import { resolveCatalogGameWithOverlay, getGameDetailsWithOverlay } from "@/lib/catalog-runtime-overlay";
import { getCoverSrc } from "@/lib/cover-url";
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
import { resolveGameEntityLinks } from "@/lib/entity-links";
import { getPriceHistory, hasPriceHistory } from "@/lib/price-history";
import { getRegionDisplay } from "@/lib/region-display";
import { getCurrentUser } from "@/lib/users";
import { listPublicSeriesForGame } from "@/lib/admin-series-manager";
import {
  getLegacySeriesRedirect,
} from "@/lib/franchise-system";
import {
  getPublicFranchiseRelationships,
  getPublicFranchisesForGame,
} from "@/lib/admin-franchise-manager";
import type { FranchiseRole } from "@/lib/franchise-types";
import { findGameFacetEntityByNameOrAlias, findGameFacetEntityBySlug } from "@/lib/game-facets/taxonomy";
import {
  cleanSupportLabel,
  defaultSupportForPlatform,
  formatGameReleaseDate,
  formatPlayerCount,
} from "@/lib/game-detail-display";
import type { DetailEntity, GameVideo } from "@/lib/types";

type Props = { params: Promise<{ slug: string }> };

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
  const game = await resolveCatalogGameWithOverlay(slug);
  if (!game || !isPublicCatalogGame(game)) return { title: "Juego no encontrado" };
  const details = await getGameDetailsWithOverlay(game.id);
  return buildGameMetadata(game, details);
}

export default async function CatalogGamePage({ params }: Props) {
  const { slug } = await params;
  const game = await resolveCatalogGameWithOverlay(slug);
  if (!game || !isPublicCatalogGame(game)) notFound();

  const canonicalSlug = buildCatalogSeoSlug(game);
  if (slug !== canonicalSlug) {
    permanentRedirect(catalogGamePath(game));
  }

  const user = await getCurrentUser();
  const ownedCount = user ? await countCatalogGameOwned(user.id, game.id) : 0;
  const owned = ownedCount > 0;

  const platform = getPlatform(game.platformSlug);
  const details = await getGameDetailsWithOverlay(game.id);
  const entityLinks = details ? resolveGameEntityLinks(details) : null;
  const grail = isGrailGame(game);
  const topSegment = isTopInSegment(game);
  const priceStatus = catalogPriceDisplayLabel(game);
  const originalContentProfile = resolveOriginalGameContents(game);
  const regionalPackaging = normalizeRegionalPackaging(game.regionalPackaging);
  const showPhysicalEdition = originalContentProfile.explicit || regionalPackaging.length > 0;
  const regionLabel = getRegionDisplay(game.region).label;
  const similar = getSimilarGames(game);
  const faqs = buildGameFaq(game, platform, details);
  const priceHistory = hasPriceHistory(game.id) ? getPriceHistory(game.id) : [];
  const publicSeries = (await listPublicSeriesForGame(game.id)).filter(
    (series) => !getLegacySeriesRedirect(series.slug),
  );
  const franchiseLinks = await getPublicFranchisesForGame(game.id);
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

  const breadcrumbItems = [
    { label: "Inicio", href: "/" },
    { label: "Plataformas", href: "/plataformas" },
    ...(platform
      ? [{ label: platform.shortName, href: `/plataforma/${platform.slug}` }]
      : []),
    { label: decodeHtmlEntities(game.title) },
  ];

  const jsonLd = [
    buildGameJsonLd(game, platform, details),
    buildBreadcrumbJsonLd([
      { name: "Inicio", href: "/" },
      { name: "Plataformas", href: "/plataformas" },
      ...(platform
        ? [{ name: platform.shortName, href: `/plataforma/${platform.slug}` }]
        : []),
      { name: decodeHtmlEntities(game.title), href: catalogGamePath(game) },
    ]),
    buildFaqJsonLd(faqs),
  ];

  const seoDescription =
    details?.description?.trim() ||
    (details?.year && platform
      ? `${game.title} (${platform.shortName}, ${regionLabel}, ${details.year}) en el catálogo de Region Atlas.`
      : `${game.title} para ${platform?.shortName ?? game.platformSlug} (${regionLabel}) en Region Atlas.`);

  const coverAlt =
    details?.seoMeta?.coverAlt?.trim() ||
    `Portada de ${game.title} para ${platform?.shortName ?? game.platformSlug} (${regionLabel})`;

  return (
    <>
      <GameJsonLd data={jsonLd} />
      <SiteNav />
      <main className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
        <Breadcrumbs items={breadcrumbItems} />

        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,400px)_1fr] lg:gap-10">
          <div className="space-y-4 lg:self-start">
            <div>
              <DetailCoverArt
                src={getCoverSrc(game.coverUrl, game.id)}
                alt={coverAlt}
                platformSlug={game.platformSlug}
                owned={owned}
                grail={grail}
                topSegment={topSegment}
              />
            </div>

            <CatalogMarketplacePanel catalogId={game.id} />
          </div>

          <div className="min-w-0 space-y-5">
            <header className="space-y-2.5">
              <div className="flex flex-wrap gap-1.5">
                <Badge>{platform?.shortName}</Badge>
                <Badge>
                  <RegionFlag region={game.region} size="sm" showLabel labelMode="short" />
                </Badge>
                <Badge
                  tone={
                    priceStatus === "verified"
                      ? "amber"
                      : priceStatus === "unverified"
                        ? "amber"
                        : "rose"
                  }
                >
                  {priceStatus === "verified"
                    ? "Precio verificado"
                    : priceStatus === "unverified"
                      ? "Precio orientativo"
                      : "Precio pendiente"}
                </Badge>
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
                  Precio {platform?.shortName} · {regionLabel}
                </span>
              </h1>
              {game.titlePc && game.titlePc !== game.title && (
                <p className="text-sm text-muted">Título alternativo: {game.titlePc}</p>
              )}
            </header>

            <GamePriceHero game={game} />

            {priceHistory.length > 0 && (
              <GamePriceHistoryChart catalogId={game.id} history={priceHistory} />
            )}

            <GameProductReference game={game} details={details} />

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

            <CollectionToggle
              catalogId={game.id}
              gameTitle={game.title}
              initialOwned={owned}
              ownedCount={ownedCount}
              isLoggedIn={Boolean(user)}
              platformName={platform?.shortName}
              platformSlug={game.platformSlug}
            />

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
                {details?.description ? (
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
                  <DetailRow
                    label="Desarrolladora"
                    value={
                      entityLinks?.developer ? (
                        <Link
                          href={entityLinks.developer.href}
                          className="text-accent hover:underline"
                        >
                          {entityLinks.developer.name}
                        </Link>
                      ) : (
                        details.developer?.name ?? "—"
                      )
                    }
                  />
                  <DetailRow
                    label="Publicadora"
                    value={
                      entityLinks?.publisher ? (
                        <Link
                          href={entityLinks.publisher.href}
                          className="text-accent hover:underline"
                        >
                          {entityLinks.publisher.name}
                        </Link>
                      ) : (
                        details.publisher?.name ?? "—"
                      )
                    }
                  />
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

            <GameFaq faqs={faqs} />

            <SimilarGames games={similar} />
          </div>
        </div>
      </main>
    </>
  );
}
