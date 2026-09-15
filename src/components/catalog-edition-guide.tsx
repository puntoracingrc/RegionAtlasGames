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
  type CatalogPhysicalComponent,
} from "@/lib/catalog-edition-guide-types";
import { catalogGamePath } from "@/lib/catalog-path";
import { getOwnedScanSetById } from "@/lib/catalog-owned-scans";
import { getCoverSrc } from "@/lib/cover-url";
import { formatEur } from "@/lib/price-format";
import { catalogConditionPriceRows } from "@/lib/price-display";
import {
  catalogPhysicalEditionBroadRegionAnchorId,
} from "@/lib/catalog-physical-edition-browse";
import { catalogPhysicalEditionHeadingLabel } from "@/lib/catalog-physical-edition-display";
import {
  catalogRegionRailSegments,
  type CatalogRegionRailIdentity,
} from "@/lib/catalog-region-rail";
import { cn } from "@/lib/cn";
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

const PHYSICAL_COMPONENT_LABELS: Record<CatalogPhysicalComponent, string> = {
  BOX: "Caja",
  OUTER_BOX: "Caja exterior",
  INNER_GAME: "Juego interior",
  FRONT: "Portada",
  BACK: "Contraportada",
  SPINE: "Lomo",
  MANUAL: "Manual",
  OTHER: "Otro componente",
};

function physicalComponentLabel(component: CatalogPhysicalComponent): string {
  return PHYSICAL_COMPONENT_LABELS[component];
}

function confidenceLabel(confidence: CatalogPhysicalEdition["confidence"]): string | null {
  if (!confidence) return null;
  return {
    CONFIRMED_PHYSICAL_COPY: "Copia física confirmada",
    CONFIRMED: "Confirmada",
    HIGH: "Confianza alta",
    PENDING_IDENTIFIER: "Identificador pendiente",
    UNCONFIRMED: "Sin confirmar",
  }[confidence];
}

function researchStatusLabel(status: CatalogEditionGuideModel["researchTasks"][number]["status"]): string {
  return {
    UNCONFIRMED: "Sin confirmar",
    PENDING_REVIEW: "Revisión pendiente",
    PHYSICAL_VARIANT_NOT_CONFIRMED: "Variante física no confirmada",
  }[status];
}

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
    if (!isStrongPhysicalEvidence(image.evidenceType) && image.placement !== "CONTENTS") continue;
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
  const currentBonusItem = guide.physicalBonusItems.find((item) => item.id === guide.currentBonusItemId);
  const visibleEditions = currentFamily
    ? guide.physicalEditions.filter((edition) => currentFamily.physicalEditionIds.includes(edition.id))
    : currentBonusItem ? [] : guide.physicalEditions;
  const hasFamilyVariants = Boolean(currentFamily && catalogEditionFamilyHasVariants(visibleEditions.length));
  const regions = [...new Set(visibleEditions.map((edition) => edition.broadRegion))];
  const currentGame = guide.currentCatalogId ? getCatalogGame(guide.currentCatalogId) : undefined;
  const currentGamePath = currentGame ? catalogGamePath(currentGame) : "/catalogo";
  return (
    <Panel>
      <section aria-label={guide.title}>
        {guide.editionFamilies.length > 1 ? (
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

        {visibleEditions.length ? (
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
        ) : null}
        {guide.physicalBonusItems.length ? (
          <PhysicalBonusItems guide={guide} currentBonusItemId={guide.currentBonusItemId} />
        ) : null}
        {guide.relatedReleases.length ? <RelatedReleases guide={guide} /> : null}
        {guide.researchTasks.length ? (
          <section className="mt-5 border-t border-border pt-4" aria-label="Investigación regional pendiente">
            <h3 className="text-sm font-semibold uppercase text-muted">Investigación regional pendiente</h3>
            <ul className="mt-2 divide-y divide-border/70">
              {guide.researchTasks.map((task) => (
                <li key={task.id} className="py-3 first:pt-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-foreground">{task.label}</p>
                    <Badge tone="amber">{researchStatusLabel(task.status)}</Badge>
                    {task.marketRegions.map((region) => (
                      <RegionFlag
                        key={region}
                        region={catalogMarketRegionToLegacyRegion(region)}
                        size="xs"
                        showLabel
                        labelMode="short"
                      />
                    ))}
                  </div>
                  {task.notes.map((note) => <p key={note} className="mt-1 text-xs leading-5 text-muted">{note}</p>)}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
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
    && edition.releaseStatus === "RELEASED"
    ? catalogConditionPriceRows(linkedCatalogGame).filter((row) => row.condition !== "loose")
    : [
        { condition: "sealed" as const, label: "Precintado" as const, price: null },
        { condition: "complete" as const, label: "Completo" as const, price: null },
      ];
  const collectionCatalogId = linkedCatalogGame?.id ?? family?.representativeCatalogId;
  const ownedCount = actionState?.ownedCount ?? 0;
  const isCurrentEdition = edition.id === guide.currentEditionId;
  const documentedRegions = edition.marketRegions.length
    ? edition.marketRegions.map(catalogMarketRegionToLegacyRegion)
    : [...new Set(edition.catalogLinks.map((link) => link.region))];
  const alternateCatalogLinks = edition.catalogLinks.filter((link) => !link.current);
  const includedEditions = edition.includesEditionIds.flatMap((id) => {
    const target = guide.physicalEditions.find((candidate) => candidate.id === id);
    return target ? [catalogPhysicalEditionHeadingLabel(target)] : [];
  });
  const containedGames = edition.containsCatalogIds.flatMap((id) => {
    const target = getCatalogGame(id);
    return target ? [target] : [];
  });
  const contentsImage = edition.images.find((image) => image.placement === "CONTENTS");
  return (
    <article
      id={edition.id}
      aria-current={isCurrentEdition ? "page" : undefined}
      className={cn(
        "scroll-mt-28 rounded-md border-2 px-3 py-4 outline-none transition-colors target:bg-accent/5 target:outline target:outline-2 target:outline-accent/50 has-[[data-physical-variant-owned=true]]:bg-emerald-500/10 has-[[data-physical-variant-owned=true]]:ring-1 has-[[data-physical-variant-owned=true]]:ring-inset has-[[data-physical-variant-owned=true]]:ring-emerald-500/40",
        isCurrentEdition
          ? "border-accent/70 bg-accent/5 shadow-sm"
          : "border-transparent",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-foreground">
          <span>{catalogPhysicalEditionHeadingLabel(edition)}</span>
          {documentedRegions.length ? <span aria-hidden="true">·</span> : null}
          {documentedRegions.map((region) => (
            <RegionFlag
              key={region}
              region={region}
              size="xs"
              showLabel
              labelMode="short"
            />
          ))}
          {!documentedRegions.length ? (
            <span className="text-sm font-medium text-muted">· Mercado nacional pendiente</span>
          ) : null}
          {edition.ratingSystems.length ? (
            <span>· {edition.ratingSystems.join(" + ")}</span>
          ) : null}
        </h4>
        <Badge tone={edition.editionType === "STANDARD" ? undefined : "amber"}>
          {catalogPhysicalEditionTypeLabel(edition.editionType)}
        </Badge>
        {confidenceLabel(edition.confidence) ? (
          <Badge tone={edition.confidence === "PENDING_IDENTIFIER" || edition.confidence === "UNCONFIRMED" ? "amber" : "green"}>
            {confidenceLabel(edition.confidence)}
          </Badge>
        ) : null}
        {edition.releaseStatus === "CANCELED_PHYSICAL_RELEASE" ? (
          <Badge tone="amber">CANCELLED / NO RETAIL RELEASE</Badge>
        ) : null}
        {ownedCount ? <Badge tone="green">Tengo {ownedCount}</Badge> : null}
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-[132px_minmax(0,1fr)]">
        <div className="min-w-0">
          <PhysicalEditionImageGallery images={galleryImages} title={edition.label} />
          {edition.releaseStatus === "CANCELED_PHYSICAL_RELEASE" ? (
            <p className="mt-3 border-y border-border/70 py-3 text-xs font-semibold text-amber-700 dark:text-amber-300">
              Sin precio CIB/new: este lanzamiento físico fue cancelado.
            </p>
          ) : (
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
          )}
        </div>
        <div className="min-w-0">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {edition.barcode ? <Fact label="EAN / UPC / JAN" value={edition.barcode} mono /> : null}
            {edition.catalogNumber ? <Fact label="Referencia del soporte" value={edition.catalogNumber} mono /> : null}
            {edition.softwareFamilyCodes.length ? <Fact label="Familias de software" value={edition.softwareFamilyCodes.join(" · ")} mono /> : null}
            {edition.productCodes.length ? <Fact label="Códigos de producto" value={edition.productCodes.join(" · ")} mono /> : null}
            {edition.boxCode ? <Fact label="Código de caja" value={edition.boxCode} mono /> : null}
            {edition.packagingLanguages.length ? <Fact label="Idiomas de la caja" value={edition.packagingLanguages.map((language) => language.toUpperCase()).join(" / ")} /> : null}
            {edition.softwareLanguages.length ? <Fact label="Idiomas del software" value={edition.softwareLanguages.map((language) => language.toUpperCase()).join(" / ")} /> : null}
            {edition.evidenceMarkets.length ? <Fact label="Mercados observados" value={edition.evidenceMarkets.join(" · ")} /> : null}
            {edition.distributionMarkets.length ? <Fact label="Distribución documentada" value={edition.distributionMarkets.join(" · ")} /> : null}
            {edition.releaseDate ? <Fact label="Fecha de esta edición" value={formatEditionReleaseDate(edition.releaseDate)} /> : null}
            {edition.releaseDateContext ? <Fact label="Contexto de la fecha" value={edition.releaseDateContext} /> : null}
          </dl>

          {edition.componentLanguageEvidence.length ? (
            <div className="mt-3 border-l-2 border-border pl-3 text-xs text-muted">
              <p className="font-semibold uppercase text-foreground">Idiomas documentados por componente</p>
              {edition.componentLanguageEvidence.map((languageEvidence, index) => (
                <p key={`${languageEvidence.component}-${index}`} className="mt-1">
                  <strong>{physicalComponentLabel(languageEvidence.component)}:</strong>{" "}
                  {languageEvidence.languages.join(" / ")}{" "}
                  <span>
                    ({languageEvidence.basis === "OBSERVED" ? "observado" : "declarado por la fuente"}
                    {languageEvidence.exhaustive ? ", listado completo" : ", alcance parcial"})
                  </span>
                </p>
              ))}
            </div>
          ) : null}

          {alternateCatalogLinks.length ? (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {alternateCatalogLinks.map((link) => (
                <Link key={link.catalogId} href={link.href} prefetch={false} className="font-semibold text-primary underline-offset-4 hover:underline">
                  Abrir ficha de catálogo · {link.region}
                </Link>
              ))}
            </div>
          ) : !edition.catalogLinks.length ? (
            <p className="mt-3 text-xs text-muted">
              {terminology === "edition" ? "Edición" : "Variante"} física documentada sin ficha de catálogo independiente.
            </p>
          ) : null}

          {family && collectionCatalogId && edition.releaseStatus === "RELEASED" ? (
            <div className="mt-4">
              <CollectionToggle
                catalogId={collectionCatalogId}
                physicalVariantId={edition.collectionIdentity === "physical-variant" ? edition.id : undefined}
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

      {edition.dimensions ? <DimensionsComparison dimensions={edition.dimensions} /> : null}

      {includedEditions.length || containedGames.length || edition.physicalContents.length || edition.digitalContents.length || contentsImage ? (
        <div className="mt-4 grid gap-4 border-l-2 border-accent/40 pl-3 md:grid-cols-[minmax(0,0.85fr)_minmax(18rem,1.15fr)] md:items-start">
          <dl className="grid grid-cols-1 gap-y-1 text-sm leading-6 sm:grid-cols-[max-content_minmax(0,1fr)] sm:gap-x-2 md:grid-cols-1 md:gap-x-0 lg:grid-cols-[max-content_minmax(0,1fr)] lg:gap-x-2">
            {includedEditions.length ? (
              <>
                <dt className="font-semibold text-foreground">Incluye:</dt>
                <dd>{includedEditions.join(" · ")}</dd>
              </>
            ) : null}
            {containedGames.length ? (
              <>
                <dt className="font-semibold text-foreground">Juegos incluidos:</dt>
                <dd>
                  {containedGames.map((game, index) => (
                    <span key={game.id}>
                      {index ? " · " : ""}
                      <Link href={catalogGamePath(game)} prefetch={false} className="text-primary underline-offset-4 hover:underline">
                        {game.title}
                      </Link>
                    </span>
                  ))}
                </dd>
              </>
            ) : null}
            {edition.physicalContents.length ? (
              <>
                <dt className="font-semibold text-foreground">Contenido físico:</dt>
                <dd>{edition.physicalContents.join(" · ")}</dd>
              </>
            ) : null}
            {edition.digitalContents.length ? (
              <>
                <dt className="font-semibold text-foreground">Contenido digital:</dt>
                <dd>{edition.digitalContents.join(" · ")}</dd>
              </>
            ) : null}
          </dl>
          {contentsImage ? (
            <figure className="min-w-0">
              <Image
                unoptimized
                src={contentsImage.url}
                width={contentsImage.width}
                height={contentsImage.height}
                alt={contentsImage.caption}
                sizes="(min-width: 768px) 420px, 100vw"
                className="h-auto w-full rounded-sm border border-border/70 bg-background object-contain"
              />
              <figcaption className="mt-1 text-xs text-muted">{contentsImage.caption}</figcaption>
            </figure>
          ) : null}
        </div>
      ) : null}

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

function PhysicalBonusItems({
  guide,
  currentBonusItemId,
}: {
  guide: CatalogEditionGuideModel;
  currentBonusItemId?: string;
}) {
  return (
    <section className="mt-5 border-t border-border pt-4" aria-label="Bonus físicos relacionados">
      <h3 className="text-sm font-semibold uppercase text-muted">Bonus físicos relacionados</h3>
      <div className="mt-2 divide-y divide-border/70">
        {guide.physicalBonusItems.map((item) => {
          const linkedGame = item.catalogIds.flatMap((id) => {
            const game = getCatalogGame(id);
            return game ? [game] : [];
          })[0];
          const cover = linkedGame ? getCoverSrc(linkedGame.coverUrl, linkedGame.id) : null;
          const priceRows = linkedGame
            ? catalogConditionPriceRows(linkedGame).filter((row) => row.condition === "complete" || row.condition === "sealed")
            : [];
          return (
            <article
              key={item.id}
              id={item.id}
              aria-current={item.id === currentBonusItemId ? "page" : undefined}
              className={cn(
                "scroll-mt-28 py-4 first:pt-2",
                item.id === currentBonusItemId ? "rounded-md bg-accent/5 px-3 ring-1 ring-accent/50" : "",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-semibold text-foreground">{item.label}</h4>
                <Badge tone="amber">BONUS FÍSICO · SIN JUEGO</Badge>
                <RegionFlag region={catalogMarketRegionToLegacyRegion(item.market)} size="xs" showLabel labelMode="short" />
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-[132px_minmax(0,1fr)]">
                <div>
                  {cover ? (
                    <Image
                      unoptimized
                      src={cover}
                      width={600}
                      height={800}
                      alt={`Imagen del bonus ${item.label}`}
                      sizes="132px"
                      className="h-auto w-full rounded-sm border border-border/70 bg-background object-contain"
                    />
                  ) : null}
                  {priceRows.length ? (
                    <dl className="mt-3 divide-y divide-border/60 border-y border-border/70 text-xs">
                      {priceRows.map((row) => (
                        <div key={row.condition} className="flex items-baseline justify-between gap-2 py-2">
                          <dt className="font-semibold text-foreground">{row.label}</dt>
                          <dd className="font-semibold text-muted">{row.price == null ? "Pendiente" : formatEur(row.price)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </div>
                <div className="min-w-0 text-sm">
                  <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    {item.upc ? <Fact label="UPC" value={item.upc} mono /> : null}
                    {item.retailer ? <Fact label="Retailer" value={item.retailer} /> : null}
                    <Fact label="Incluye juego" value="No" />
                    <Fact label="Tipo" value="SteelBook case" />
                  </dl>
                  <p className="mt-3 text-xs leading-5 text-muted">
                    Se conserva la ficha, portada y referencia de precio de la pieza; no cuenta como edición física del juego.
                  </p>
                  {item.notes.map((note) => <p key={note} className="mt-2 text-xs leading-5 text-muted">{note}</p>)}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function RelatedReleases({ guide }: { guide: CatalogEditionGuideModel }) {
  return (
    <section className="mt-5 border-t border-border pt-4" aria-label="Lanzamientos relacionados">
      <h3 className="text-sm font-semibold uppercase text-muted">Lanzamientos relacionados</h3>
      <ul className="mt-2 divide-y divide-border/70">
        {guide.relatedReleases.map((release) => (
          <li key={release.id} className="py-3 first:pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-foreground">{release.label}</p>
              <Badge>{release.type === "EXPANSION" ? "EXPANSIÓN" : release.type}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted">Expansión de <span className="font-mono">{release.expansionOf}</span>.</p>
            {release.notes.map((note) => <p key={note} className="mt-1 text-xs leading-5 text-muted">{note}</p>)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DimensionsComparison({ dimensions }: { dimensions: NonNullable<CatalogPhysicalEdition["dimensions"]> }) {
  const formatCm = (value: number) => `${value.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} cm`;
  return (
    <div className="mt-4 border-y border-border/70 py-3">
      <div className="grid w-full grid-cols-1 items-center gap-4 sm:grid-cols-[minmax(7.5rem,0.55fr)_minmax(17rem,1.45fr)]">
        {dimensions.comparisonImageUrl ? (
          <div className="w-full max-w-56 justify-self-center">
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
          <table className="mt-2 w-full table-fixed text-sm">
            <caption className="sr-only">Comparación de las medidas exteriores de la caja Special y una caja estándar</caption>
            <thead>
              <tr className="text-left text-xs font-semibold text-muted">
                <th scope="col" className="w-[42%] pb-2 pr-3"><span className="sr-only">Medida</span></th>
                <th scope="col" className="pb-2 pr-3 text-right">Caja Special</th>
                {dimensions.comparison ? <th scope="col" className="pb-2 text-right">Caja estándar</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              <Dimension label="Ancho" value={formatCm(dimensions.widthCm)} comparisonValue={dimensions.comparison ? formatCm(dimensions.comparison.widthCm) : undefined} />
              <Dimension label="Alto" value={formatCm(dimensions.heightCm)} comparisonValue={dimensions.comparison ? formatCm(dimensions.comparison.heightCm) : undefined} />
              <Dimension label="Profundidad" value={formatCm(dimensions.depthCm)} comparisonValue={dimensions.comparison ? formatCm(dimensions.comparison.depthCm) : undefined} />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Dimension({ label, value, comparisonValue }: { label: string; value: string; comparisonValue?: string }) {
  return (
    <tr>
      <th scope="row" className="py-2 pr-3 text-left font-semibold text-foreground">{label}</th>
      <td className="whitespace-nowrap py-2 pr-3 text-right text-muted">{value}</td>
      {comparisonValue ? <td className="whitespace-nowrap py-2 text-right text-muted">{comparisonValue}</td> : null}
    </tr>
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
