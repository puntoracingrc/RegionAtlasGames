import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CollectionToggle } from "@/components/collection-toggle";
import { GameFaq } from "@/components/game-faq";
import { GameJsonLd } from "@/components/game-json-ld";
import { GamePriceHero } from "@/components/game-price-hero";
import { GameRegionIdentityPanel } from "@/components/game-region-identity-panel";
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
import { getPlatform } from "@/lib/catalog";
import { grailLabel, isGrailGame, isTopInSegment, topSegmentLabel } from "@/lib/game-highlight";
import { esPriceDisplayLabel } from "@/lib/price-display";
import { RegionEvidenceRulesPanel } from "@/components/region-evidence-rules-panel";
import { REGION_VERIFICATION_POLICY, priceVerificationLabel } from "@/lib/listing-region-verification";
import { getGameDetails } from "@/lib/indexes";
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
  const owned = user ? isCatalogGameOwned(user.id, game.id) : false;
  const ownedCount = user ? countCatalogGameOwned(user.id, game.id) : 0;

  const platform = getPlatform(game.platformSlug);
  const details = getGameDetails(game.id);
  const grail = isGrailGame(game);
  const topSegment = isTopInSegment(game);
  const priceStatus = esPriceDisplayLabel(game);
  const regionLabel = getRegionDisplay(game.region).label;
  const similar = getSimilarGames(game);
  const faqs = buildGameFaq(game, platform, details);

  const breadcrumbItems = [
    { label: "Inicio", href: "/" },
    { label: "Plataformas", href: "/plataformas" },
    ...(platform
      ? [{ label: platform.shortName, href: `/plataforma/${platform.slug}` }]
      : []),
    { label: game.title },
  ];

  const jsonLd = [
    buildGameJsonLd(game, platform),
    buildBreadcrumbJsonLd([
      { name: "Inicio", href: "/" },
      { name: "Plataformas", href: "/plataformas" },
      ...(platform
        ? [{ name: platform.shortName, href: `/plataforma/${platform.slug}` }]
        : []),
      { name: game.title, href: catalogGamePath(game) },
    ]),
    buildFaqJsonLd(faqs),
  ];

  const seoDescription =
    details?.year && platform
      ? `${game.title} (${platform.shortName}, ${regionLabel}, ${details.year}) en el catálogo de Region Atlas.`
      : `${game.title} para ${platform?.shortName ?? game.platformSlug} (${regionLabel}) en Region Atlas.`;

  return (
    <>
      <GameJsonLd data={jsonLd} />
      <SiteNav />
      <main className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
        <Breadcrumbs items={breadcrumbItems} />

        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,400px)_1fr] lg:gap-10">
          <div className="lg:sticky lg:top-20 lg:self-start">
            <DetailCoverArt
              src={game.coverUrl}
              alt={game.title}
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
                    ? "Precio ES verificado"
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

            <GameRegionIdentityPanel game={game} details={details} />

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
              <p className="text-sm leading-relaxed text-muted">{seoDescription}</p>
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
                  <DetailRow label="Referencia" value={details.reference || "—"} />
                  <DetailRow label="Soporte" value={details.support || "—"} />
                  <DetailRow
                    label="Jugadores"
                    value={details.players != null ? String(details.players) : "—"}
                  />
                  <DetailRow
                    label="Desarrolladora"
                    value={
                      details.developer ? (
                        <Link
                          href={`/compania/${details.developer.slug}`}
                          className="text-accent hover:underline"
                        >
                          {details.developer.name}
                        </Link>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <DetailRow
                    label="Publicadora"
                    value={
                      details.publisher ? (
                        <Link
                          href={`/compania/${details.publisher.slug}`}
                          className="text-accent hover:underline"
                        >
                          {details.publisher.name}
                        </Link>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <DetailRow
                    label="Géneros"
                    value={
                      details.genres.length > 0 ? (
                        <span className="flex flex-wrap gap-1.5">
                          {details.genres.map((g) => (
                            <Link
                              key={g.slug}
                              href={`/genero/${g.slug}`}
                              className="rounded-md bg-white/10 px-2 py-0.5 text-xs text-accent/90 hover:bg-white/15"
                            >
                              {g.name}
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
