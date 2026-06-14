import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CollectionToggle } from "@/components/collection-toggle";
import { GameFaq } from "@/components/game-faq";
import { GameJsonLd } from "@/components/game-json-ld";
import { GamePriceHero } from "@/components/game-price-hero";
import { GamePriceHistoryChart } from "@/components/game-price-history-chart";
import { GameProductReference } from "@/components/game-product-reference";
import { RetailPriceReferences } from "@/components/retail-price-references";
import { ProListingsComparator } from "@/components/pro-listings-comparator";
import { RecordedProSalesPanel } from "@/components/recorded-pro-sales-panel";
import { SimilarGames } from "@/components/similar-games";
import { DetailCoverArt } from "@/components/detail-cover-art";
import { RegionFlag } from "@/components/region-flag";
import { SiteNav } from "@/components/site-nav";
import { Badge, DetailRow, Panel, PanelTitle } from "@/components/ui";
import {
  countCatalogGameOwned,
  isCatalogGameOwned,
} from "@/lib/collection-store";
import {
  buildBreadcrumbJsonLd,
  buildCatalogSeoSlug,
  buildFaqJsonLd,
  buildGameFaq,
  buildGameJsonLd,
  buildGameMetadata,
  catalogGamePath,
  getSimilarGames,
  resolveCatalogGameParam,
} from "@/lib/catalog-seo";
import { getCoverSrc } from "@/lib/cover-url";
import { decodeHtmlEntities } from "@/lib/decode-html-entities";
import { getPlatform } from "@/lib/catalog";
import { grailLabel, isGrailGame, isTopInSegment, topSegmentLabel } from "@/lib/game-highlight";
import { esPriceDisplayLabel } from "@/lib/price-display";
import { RegionEvidenceRulesPanel } from "@/components/region-evidence-rules-panel";
import { REGION_VERIFICATION_POLICY, priceVerificationLabel } from "@/lib/listing-region-verification";
import { getGameDetails } from "@/lib/indexes";
import { resolveGameEntityLinks } from "@/lib/entity-links";
import { getPriceHistory, hasPriceHistory } from "@/lib/price-history";
import { getRegionDisplay } from "@/lib/region-display";
import { getCurrentUser } from "@/lib/users";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const game = resolveCatalogGameParam(slug);
  if (!game) return { title: "Juego no encontrado" };
  return buildGameMetadata(game);
}

export default async function CatalogGamePage({ params }: Props) {
  const { slug } = await params;
  const game = resolveCatalogGameParam(slug);
  if (!game) notFound();

  const canonicalSlug = buildCatalogSeoSlug(game);
  if (slug !== canonicalSlug) {
    permanentRedirect(catalogGamePath(game));
  }

  const user = await getCurrentUser();
  const owned = user ? await isCatalogGameOwned(user.id, game.id) : false;
  const ownedCount = user ? await countCatalogGameOwned(user.id, game.id) : 0;

  const platform = getPlatform(game.platformSlug);
  const details = getGameDetails(game.id);
  const entityLinks = details ? resolveGameEntityLinks(details) : null;
  const grail = isGrailGame(game);
  const topSegment = isTopInSegment(game);
  const priceStatus = esPriceDisplayLabel(game);
  const regionLabel = getRegionDisplay(game.region).label;
  const similar = getSimilarGames(game);
  const faqs = buildGameFaq(game, platform, details);
  const priceHistory = hasPriceHistory(game.id) ? getPriceHistory(game.id) : [];

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
          <div className="lg:sticky lg:top-20 lg:self-start">
            <DetailCoverArt
              src={getCoverSrc(game.coverUrl, game.id)}
              alt={coverAlt}
              platformSlug={game.platformSlug}
              owned={owned}
              grail={grail}
              topSegment={topSegment}
            />
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
                        ? "rose"
                        : "rose"
                  }
                >
                  {priceStatus === "verified"
                    ? "Precio verificado"
                    : priceStatus === "unverified"
                      ? "Precio sin verificar región"
                      : "Precio pendiente"}
                </Badge>
                {owned && <Badge tone="green">En tu colección</Badge>}
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

            <RetailPriceReferences game={game} />

            <CollectionToggle
              catalogId={game.id}
              initialOwned={owned}
              ownedCount={ownedCount}
              isLoggedIn={Boolean(user)}
            />

            <ProListingsComparator catalogId={game.id} />

            <RecordedProSalesPanel catalogId={game.id} />

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
              <p className="mt-3 text-sm leading-relaxed text-muted">{REGION_VERIFICATION_POLICY}</p>
              <p className="mt-2 text-xs text-muted/80">
                Estado: {priceVerificationLabel(game.priceRegionVerified)}
                {game.priceSource ? ` · Fuente: ${game.priceSource}` : ""}
              </p>
            </Panel>

            {details && (
              <Panel>
                <PanelTitle>Detalles del juego</PanelTitle>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <DetailRow label="Año" value={details.year ? String(details.year) : "—"} />
                  <DetailRow label="Lanzamiento" value={details.releaseDate || "—"} />
                  <DetailRow label="Soporte" value={details.support || "—"} />
                  <DetailRow
                    label="Jugadores"
                    value={details.players != null ? String(details.players) : "—"}
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
                        <span className="flex flex-wrap gap-1.5">
                          {entityLinks.genres.map((genre) => (
                            <Link
                              key={genre.slug}
                              href={genre.href}
                              className="rounded-md bg-white/10 px-2 py-0.5 text-xs text-accent/90 hover:bg-white/15"
                            >
                              {genre.name}
                            </Link>
                          ))}
                        </span>
                      ) : (
                        "—"
                      )
                    }
                  />
                  {details.series && (
                    <DetailRow
                      label="Saga"
                      value={
                        <Link
                          href={`/saga/${details.series.slug}`}
                          className="text-accent hover:underline"
                        >
                          {details.series.name}
                        </Link>
                      }
                    />
                  )}
                </dl>
              </Panel>
            )}

            <RegionEvidenceRulesPanel
              platformSlug={game.platformSlug}
              catalogRegion={game.region}
            />

            <GameFaq faqs={faqs} />

            <SimilarGames games={similar} />
          </div>
        </div>
      </main>
    </>
  );
}
