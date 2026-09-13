import Image from "next/image";
import Link from "next/link";
import {
  PhysicalEditionImageGallery,
  type PhysicalEditionGalleryImage,
} from "@/components/physical-edition-image-gallery";
import { CollectionToggle } from "@/components/collection-toggle";
import { RegionFlag } from "@/components/region-flag";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import { getCatalogGame } from "@/lib/catalog";
import { getCatalogEditionGuide } from "@/lib/catalog-edition-guides";
import {
  catalogBroadRegionLabel,
  catalogEditionFamilyHasVariants,
  catalogMarketRegionToLegacyRegion,
  catalogPhysicalEditionTypeLabel,
  isStrongPhysicalEvidence,
  type CatalogEditionFamily,
  type CatalogEditionGuideModel,
  type CatalogPhysicalEdition,
} from "@/lib/catalog-edition-guide-types";
import { catalogGamePath } from "@/lib/catalog-path";
import { getOwnedScanSetById } from "@/lib/catalog-owned-scans";
import { getCoverSrc } from "@/lib/cover-url";
import { formatEur } from "@/lib/price-format";
import { catalogConditionPriceRows } from "@/lib/price-display";
import {
  catalogPhysicalEditionBroadRegionAnchorId,
  catalogPhysicalEditionOverviewRegions,
} from "@/lib/catalog-physical-edition-browse";
import {
  catalogRegionRailSegments,
  type CatalogRegionRailIdentity,
} from "@/lib/catalog-region-rail";
import type { CatalogGame } from "@/lib/types";

type CatalogEditionGuideProps = {
  game: CatalogGame;
  isLoggedIn?: boolean;
  physicalVariantActionStates?: Record<string, {
    ownedCount: number;
    wished: boolean;
    collectionItemId?: string;
  }>;
};

export function CatalogEditionGuide({
  game,
  isLoggedIn = false,
  physicalVariantActionStates = {},
}: CatalogEditionGuideProps) {
  const guide = getCatalogEditionGuide(game);
  if (!guide) return null;
  return guide.schemaVersion === 1
    ? <LegacyEditionGuide guide={guide} />
    : (
      <PhysicalEditionGuide
        guide={guide}
        isLoggedIn={isLoggedIn}
        physicalVariantActionStates={physicalVariantActionStates}
      />
    );
}

function LegacyEditionGuide({ guide }: { guide: CatalogEditionGuideModel }) {
  return (
    <Panel>
      <section aria-label={guide.title}>
        <PanelTitle>{guide.title}</PanelTitle>
        <ul className="mt-3 divide-y divide-border">
          {guide.physicalEditions.map((edition) => {
            const link = edition.catalogLinks[0];
            return (
              <li key={edition.id} className="py-3 first:pt-0">
                {link ? (
                  <Link href={link.href} prefetch={false} aria-current={link.current ? "page" : undefined} className="font-semibold text-primary underline-offset-4 hover:underline">
                    {edition.label}
                  </Link>
                ) : <span className="font-semibold">{edition.label}</span>}
                {link?.current ? <span className="ml-2 text-xs text-muted">Esta ficha</span> : null}
                {edition.notes.map((note) => <p key={note} className="mt-1 text-sm leading-6 text-muted">{note}</p>)}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs leading-5 text-muted">{guide.note}</p>
      </section>
    </Panel>
  );
}

function physicalEditionGalleryImages(edition: CatalogPhysicalEdition): PhysicalEditionGalleryImage[] {
  const images: PhysicalEditionGalleryImage[] = [];
  const seen = new Set<string>();
  const add = (image: PhysicalEditionGalleryImage) => {
    if (seen.has(image.src)) return;
    seen.add(image.src);
    images.push(image);
  };

  for (const scanSetId of edition.scanSetIds) {
    const scanSet = getOwnedScanSetById(scanSetId);
    if (!scanSet) continue;
    const orderedImages = [...scanSet.images].sort(
      (left, right) =>
        Number(right.url === scanSet.primaryCoverUrl) -
        Number(left.url === scanSet.primaryCoverUrl),
    );
    for (const image of orderedImages) {
      add({
        id: `${scanSetId}:${image.role}:${image.url}`,
        src: image.url,
        thumbnailSrc: image.thumbnailUrl,
        width: image.width,
        height: image.height,
        label: image.label,
      });
    }
  }

  for (const image of edition.images) {
    if (!isStrongPhysicalEvidence(image.evidenceType)) continue;
    add({
      id: image.key,
      src: image.url,
      thumbnailSrc: image.thumbnailUrl,
      width: image.width,
      height: image.height,
      label: image.caption,
    });
  }

  const linkedGame = edition.catalogIds.flatMap((id) => {
    const game = getCatalogGame(id);
    return game ? [game] : [];
  })[0];
  if (!images.length && linkedGame) {
    const cover = getCoverSrc(linkedGame.coverUrl, linkedGame.id);
    if (cover) {
      add({
        id: `catalog:${linkedGame.id}`,
        src: cover,
        thumbnailSrc: cover,
        width: 600,
        height: 800,
        label: `Portada de ${edition.label}`,
      });
    }
  }
  return images;
}

function familyHref(family: CatalogEditionFamily): string | null {
  const game = getCatalogGame(family.representativeCatalogId);
  return game ? catalogGamePath(game) : null;
}

function RegionRail({ identity }: { identity: CatalogRegionRailIdentity }) {
  return (
    <span
      aria-hidden="true"
      className="absolute bottom-4 left-0 top-4 flex w-1.5 flex-col overflow-hidden rounded-full border border-border/70 shadow-sm"
    >
      {catalogRegionRailSegments(identity).map((color, index) => (
        <span
          key={`${identity}-${index}`}
          className="min-h-3 flex-1"
          style={{ backgroundColor: color }}
        />
      ))}
    </span>
  );
}

function PhysicalEditionGuide({
  guide,
  isLoggedIn,
  physicalVariantActionStates,
}: {
  guide: CatalogEditionGuideModel;
  isLoggedIn: boolean;
  physicalVariantActionStates: NonNullable<CatalogEditionGuideProps["physicalVariantActionStates"]>;
}) {
  const currentFamily = guide.editionFamilies.find((family) => family.id === guide.currentEditionFamilyId);
  const visibleEditions = currentFamily
    ? guide.physicalEditions.filter((edition) => currentFamily.physicalEditionIds.includes(edition.id))
    : guide.physicalEditions;
  const hasFamilyVariants = Boolean(currentFamily && catalogEditionFamilyHasVariants(visibleEditions.length));
  const regions = [...new Set(visibleEditions.map((edition) => edition.broadRegion))];
  const currentGame = guide.currentCatalogId ? getCatalogGame(guide.currentCatalogId) : undefined;
  const currentGamePath = currentGame ? catalogGamePath(currentGame) : "/catalogo";
  return (
    <Panel>
      <section aria-label={guide.title}>
        {guide.editionFamilies.length ? (
          <nav aria-label="Familias de edición" className="flex flex-wrap gap-2 border-b border-border pb-4">
            {guide.editionFamilies.map((family) => {
              const href = familyHref(family);
              const current = family.id === currentFamily?.id;
              return href ? (
                <Link
                  key={family.id}
                  href={href}
                  prefetch={false}
                  aria-current={current ? "page" : undefined}
                  className={current ? "btn-primary inline-flex min-h-10 items-center px-4 text-sm" : "btn-secondary inline-flex min-h-10 items-center px-4 text-sm"}
                >
                  {family.label}
                </Link>
              ) : null;
            })}
          </nav>
        ) : null}

        <div className="mt-5 overflow-hidden rounded-md border border-border/80">
          {regions.map((region) => {
            const editions = visibleEditions.filter((edition) => edition.broadRegion === region);
            return (
              <section
                key={region}
                id={catalogPhysicalEditionBroadRegionAnchorId(region)}
                data-broad-region={region}
                className="catalog-region-surface relative scroll-mt-28 border-b border-border/80 px-5 py-6 outline-none transition-colors last:border-b-0 target:outline target:outline-2 target:outline-accent/50"
              >
                <RegionRail identity={region} />
                <h3 className="mb-3 border-b border-border/60 pb-3 text-lg font-bold text-foreground">
                  {catalogBroadRegionLabel(region)}
                </h3>
                <div className="divide-y divide-border/70">
                  {editions.map((edition) => (
                    <PhysicalEditionRow
                      key={edition.id}
                      edition={edition}
                      guide={guide}
                      family={currentFamily}
                      terminology={hasFamilyVariants ? "variant" : "edition"}
                      isLoggedIn={isLoggedIn}
                      actionState={physicalVariantActionStates[edition.id]}
                      currentGame={currentGame}
                      currentGamePath={currentGamePath}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </Panel>
  );
}

function PhysicalEditionRow({
  edition,
  guide,
  family,
  terminology,
  isLoggedIn,
  actionState,
  currentGame,
  currentGamePath,
}: {
  edition: CatalogPhysicalEdition;
  guide: CatalogEditionGuideModel;
  family?: CatalogEditionFamily;
  terminology: "edition" | "variant";
  isLoggedIn: boolean;
  actionState?: {
    ownedCount: number;
    wished: boolean;
    collectionItemId?: string;
  };
  currentGame?: CatalogGame;
  currentGamePath: string;
}) {
  const galleryImages = physicalEditionGalleryImages(edition);
  const linkedCatalogGame = edition.catalogIds.flatMap((id) => {
    const game = getCatalogGame(id);
    return game ? [game] : [];
  })[0];
  const priceRows = linkedCatalogGame
    ? catalogConditionPriceRows(linkedCatalogGame).filter((row) => row.condition !== "loose")
    : [
        { condition: "sealed" as const, label: "Precintado" as const, price: null },
        { condition: "complete" as const, label: "Completo" as const, price: null },
      ];
  const collectionCatalogId = linkedCatalogGame?.id ?? family?.representativeCatalogId;
  const ownedCount = actionState?.ownedCount ?? 0;
  const documentedRegions = edition.marketRegions.length
    ? edition.marketRegions.map(catalogMarketRegionToLegacyRegion)
    : catalogPhysicalEditionOverviewRegions([edition]);
  const includedEditions = edition.includesEditionIds.flatMap((id) => {
    const target = guide.physicalEditions.find((candidate) => candidate.id === id);
    return target ? [target.label] : [];
  });
  const containedGames = edition.containsCatalogIds.flatMap((id) => {
    const target = getCatalogGame(id);
    return target ? [target] : [];
  });
  return (
    <article
      id={edition.id}
      className="scroll-mt-28 rounded-md px-3 py-4 outline-none transition-colors target:bg-accent/5 target:outline target:outline-2 target:outline-accent/50 first:pt-2 has-[[data-physical-variant-owned=true]]:bg-emerald-500/10 has-[[data-physical-variant-owned=true]]:ring-1 has-[[data-physical-variant-owned=true]]:ring-inset has-[[data-physical-variant-owned=true]]:ring-emerald-500/40"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-semibold text-foreground">{edition.label}</h4>
        <Badge tone={edition.editionType === "STANDARD" ? undefined : "amber"}>
          {catalogPhysicalEditionTypeLabel(edition.editionType)}
        </Badge>
        {edition.id === guide.currentEditionId ? <Badge tone="green">Esta ficha</Badge> : null}
        {ownedCount ? <Badge tone="green">Tengo {ownedCount}</Badge> : null}
      </div>

      <div className="mt-2 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span className="font-semibold text-foreground/80">
          {edition.marketRegions.length ? "Mercados documentados" : "Región documentada"}
        </span>
        {documentedRegions.map((region) => (
          <RegionFlag
            key={region}
            region={region}
            size="xs"
            showLabel
            labelMode="short"
          />
        ))}
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-[132px_minmax(0,1fr)]">
        <div className="min-w-0">
          <PhysicalEditionImageGallery images={galleryImages} title={edition.label} />
          <dl className="mt-3 divide-y divide-border/60 border-y border-border/70 text-xs">
            {priceRows.map((row) => (
              <div
                key={row.condition}
                className="flex items-baseline justify-between gap-2 py-2 first:pt-0 last:pb-0"
              >
                <dt className="font-semibold text-foreground">{row.label}</dt>
                <dd className="shrink-0 font-semibold text-muted">
                  {row.price == null ? "Pendiente" : formatEur(row.price)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="min-w-0">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {edition.packagingLanguages.length ? <Fact label="Idiomas del packaging" value={edition.packagingLanguages.join(" / ")} /> : null}
            {edition.ratingSystems.length ? <Fact label="Clasificación impresa" value={edition.ratingSystems.join(" + ")} /> : null}
            {edition.barcode ? <Fact label="EAN / UPC / JAN" value={edition.barcode} mono /> : null}
            {edition.catalogNumber ? <Fact label="Referencia del soporte" value={edition.catalogNumber} mono /> : null}
            {edition.boxCode ? <Fact label="Código de caja" value={edition.boxCode} mono /> : null}
            {edition.releaseDate ? <Fact label="Fecha de esta edición" value={formatEditionReleaseDate(edition.releaseDate)} /> : null}
            {edition.releaseDateContext ? <Fact label="Contexto de la fecha" value={edition.releaseDateContext} /> : null}
          </dl>

          {edition.dimensions ? <DimensionsComparison dimensions={edition.dimensions} /> : null}

          {edition.catalogLinks.length ? (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {edition.catalogLinks.map((link) => (
                <Link key={link.catalogId} href={link.href} prefetch={false} className="font-semibold text-primary underline-offset-4 hover:underline">
                  {link.current ? "Ficha actual" : `Abrir ficha de catálogo · ${link.region}`}
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted">
              {terminology === "edition" ? "Edición" : "Variante"} física documentada sin ficha de catálogo independiente.
            </p>
          )}

          {includedEditions.length || containedGames.length || edition.physicalContents.length || edition.digitalContents.length ? (
            <div className="mt-4 border-l-2 border-accent/40 pl-3 text-sm leading-6">
              {includedEditions.length ? <p><strong>Incluye:</strong> {includedEditions.join(" · ")}</p> : null}
              {containedGames.length ? (
                <p>
                  <strong>Juegos incluidos:</strong>{" "}
                  {containedGames.map((game, index) => (
                    <span key={game.id}>
                      {index ? " · " : ""}
                      <Link href={catalogGamePath(game)} prefetch={false} className="text-primary underline-offset-4 hover:underline">
                        {game.title}
                      </Link>
                    </span>
                  ))}
                </p>
              ) : null}
              {edition.physicalContents.length ? <p><strong>Contenido físico:</strong> {edition.physicalContents.join(" · ")}</p> : null}
              {edition.digitalContents.length ? <p><strong>Contenido digital:</strong> {edition.digitalContents.join(" · ")}</p> : null}
            </div>
          ) : null}

          {family && collectionCatalogId ? (
            <div className="mt-4">
              <CollectionToggle
                catalogId={collectionCatalogId}
                physicalVariantId={edition.id}
                gameTitle={`${linkedCatalogGame?.title ?? currentGame?.title ?? "Juego"} · ${edition.label}`}
                initialOwned={ownedCount > 0}
                ownedCount={ownedCount}
                initialWished={actionState?.wished ?? false}
                initialCollectionItemId={actionState?.collectionItemId}
                isLoggedIn={isLoggedIn}
                gamePath={`${currentGamePath}#${edition.id}`}
                platformSlug={linkedCatalogGame?.platformSlug ?? currentGame?.platformSlug ?? ""}
                showShare={false}
              />
            </div>
          ) : null}
        </div>
      </div>

      {edition.variants.length ? (
        <div className="mt-4 border-t border-border/70 pt-3">
          <p className="text-xs font-semibold uppercase text-muted">Variantes coleccionables</p>
          <ul className="mt-2 divide-y divide-border/60">
            {edition.variants.map((variant) => (
              <li key={variant.id} className="py-2 text-sm first:pt-0">
                <p className="font-semibold">{variant.label}</p>
                <p className="text-muted">{[...variant.stickers, ...variant.markings].join(" · ")}</p>
                <p className="text-xs text-muted">Identidad de precio: <span className="font-mono">{variant.priceIdentity}</span></p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {edition.notes.map((note) => <p key={note} className="mt-2 text-xs leading-5 text-muted">{note}</p>)}
    </article>
  );
}

function DimensionsComparison({ dimensions }: { dimensions: NonNullable<CatalogPhysicalEdition["dimensions"]> }) {
  const formatCm = (value: number) => `${value.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} cm`;
  return (
    <div className="mt-4 border-y border-border/70 py-3">
      <div className="grid w-full grid-cols-[minmax(0,8rem)_minmax(0,1fr)] items-center gap-4 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] sm:gap-6">
        {dimensions.comparisonImageUrl ? (
          <div className="w-full">
            <Image
              unoptimized
              src={dimensions.comparisonImageUrl}
              width={900}
              height={942}
              alt="Comparación de la caja de esta edición con una caja estándar de PS5"
              className="h-auto w-full object-contain"
            />
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-muted">Medidas exteriores {dimensions.approximate ? "aproximadas" : ""}</p>
          <dl className="mt-2 divide-y divide-border/60 text-sm">
            <Dimension label="Ancho" value={formatCm(dimensions.widthCm)} />
            <Dimension label="Alto" value={formatCm(dimensions.heightCm)} />
            <Dimension label="Profundidad" value={formatCm(dimensions.depthCm)} />
          </dl>
        </div>
      </div>
    </div>
  );
}

function Dimension({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <dt className="font-semibold text-foreground">{label}</dt>
      <dd className="shrink-0 text-muted">{value}</dd>
    </div>
  );
}

function formatEditionReleaseDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><dt className="font-semibold text-foreground">{label}</dt><dd className={mono ? "font-mono text-muted" : "text-muted"}>{value}</dd></div>;
}
