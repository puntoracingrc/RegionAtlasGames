import Image from "next/image";
import Link from "next/link";
import { PhysicalVariantCollectionToggle } from "@/components/physical-variant-collection-toggle";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import { getCatalogGame } from "@/lib/catalog";
import { getCatalogEditionGuide } from "@/lib/catalog-edition-guides";
import {
  catalogBroadRegionLabel,
  catalogEditionFamilyCountLabel,
  catalogEditionFamilyHasVariants,
  catalogPhysicalEditionTypeLabel,
  isStrongPhysicalEvidence,
  type CatalogEditionFamily,
  type CatalogEditionGuideModel,
  type CatalogPhysicalEdition,
  type CatalogPhysicalEvidenceType,
} from "@/lib/catalog-edition-guide-types";
import { catalogGamePath } from "@/lib/catalog-path";
import { getOwnedScanSetById } from "@/lib/catalog-owned-scans";
import { getCoverSrc } from "@/lib/cover-url";
import { formatEur } from "@/lib/price-format";
import { catalogConditionPriceRows } from "@/lib/price-display";
import type { CatalogGame } from "@/lib/types";

const EVIDENCE_LABELS: Record<CatalogPhysicalEvidenceType, string> = {
  REAL_SCAN: "Escaneo real",
  REAL_PHOTO: "Fotografía real",
  UNBOXING_FRAME: "Fotograma de unboxing",
  RETAILER_PHOTO_CONFIRMED: "Fotografía física confirmada",
  RETAILER_ASSET: "Imagen de retailer",
  PUBLISHER_MOCKUP: "Mockup del editor",
  PRE_RELEASE_ASSET: "Imagen previa al lanzamiento",
  PUBLISHER_DOCUMENTATION: "Documentación del editor",
  OWNER_CONFIRMATION: "Confirmación del propietario",
  UNKNOWN: "Procedencia pendiente",
};

type CatalogEditionGuideProps = {
  game: CatalogGame;
  isLoggedIn?: boolean;
  physicalVariantOwnedCounts?: Record<string, number>;
};

export function CatalogEditionGuide({
  game,
  isLoggedIn = false,
  physicalVariantOwnedCounts = {},
}: CatalogEditionGuideProps) {
  const guide = getCatalogEditionGuide(game);
  if (!guide) return null;
  return guide.schemaVersion === 1
    ? <LegacyEditionGuide guide={guide} />
    : (
      <PhysicalEditionGuide
        guide={guide}
        isLoggedIn={isLoggedIn}
        physicalVariantOwnedCounts={physicalVariantOwnedCounts}
      />
    );
}

function LegacyEditionGuide({ guide }: { guide: CatalogEditionGuideModel }) {
  const currentImages = guide.physicalEditions.find((edition) => edition.id === guide.currentEditionId)?.images ?? [];
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
        <ReferenceSection guide={guide} images={currentImages} />
      </section>
    </Panel>
  );
}

function physicalEditionCover(edition: CatalogPhysicalEdition): string | null {
  const scanSet = edition.scanSetIds.flatMap((id) => {
    const scans = getOwnedScanSetById(id);
    return scans ? [scans] : [];
  })[0];
  if (scanSet) return scanSet.primaryCoverUrl;
  const evidenceImage = edition.images.find((image) => isStrongPhysicalEvidence(image.evidenceType));
  if (evidenceImage) return evidenceImage.thumbnailUrl;
  const linkedGame = edition.catalogIds.flatMap((id) => {
    const game = getCatalogGame(id);
    return game ? [game] : [];
  })[0];
  return linkedGame ? getCoverSrc(linkedGame.coverUrl, linkedGame.id) : null;
}

function familyHref(family: CatalogEditionFamily): string | null {
  const game = getCatalogGame(family.representativeCatalogId);
  return game ? catalogGamePath(game) : null;
}

function PhysicalEditionGuide({
  guide,
  isLoggedIn,
  physicalVariantOwnedCounts,
}: {
  guide: CatalogEditionGuideModel;
  isLoggedIn: boolean;
  physicalVariantOwnedCounts: Record<string, number>;
}) {
  const currentFamily = guide.editionFamilies.find((family) => family.id === guide.currentEditionFamilyId);
  const visibleEditions = currentFamily
    ? guide.physicalEditions.filter((edition) => currentFamily.physicalEditionIds.includes(edition.id))
    : guide.physicalEditions;
  const hasFamilyVariants = Boolean(currentFamily && catalogEditionFamilyHasVariants(visibleEditions.length));
  const regions = [...new Set(visibleEditions.map((edition) => edition.broadRegion))];
  const ownedVariantCount = visibleEditions.filter((edition) => (physicalVariantOwnedCounts[edition.id] ?? 0) > 0).length;
  const currentGame = guide.currentCatalogId ? getCatalogGame(guide.currentCatalogId) : undefined;
  const loginPath = `/login?next=${encodeURIComponent(currentGame ? catalogGamePath(currentGame) : "/catalogo")}`;
  return (
    <Panel>
      <section aria-label={guide.title}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-accent">Juego + plataforma</p>
            <PanelTitle>{guide.title}</PanelTitle>
            {currentFamily ? <p className="mt-1 text-sm font-semibold text-foreground">{currentFamily.label}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>
              {currentFamily
                ? catalogEditionFamilyCountLabel(visibleEditions.length)
                : `${visibleEditions.length} ${visibleEditions.length === 1 ? "edición física" : "ediciones físicas"}`}
            </Badge>
            {currentFamily && isLoggedIn ? <Badge tone="green">{ownedVariantCount} de {visibleEditions.length} en tu colección</Badge> : null}
          </div>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted">{guide.note}</p>

        {guide.editionFamilies.length ? (
          <nav aria-label="Familias de edición" className="mt-5 flex flex-wrap gap-2 border-y border-border py-3">
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

        {currentFamily && hasFamilyVariants ? (
          <nav aria-label={`Variantes de ${currentFamily.label}`} className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {visibleEditions.map((edition) => {
              const cover = physicalEditionCover(edition);
              const ownedCount = physicalVariantOwnedCounts[edition.id] ?? 0;
              return (
                <a key={edition.id} href={`#${edition.id}`} className="grid min-h-24 grid-cols-[56px_minmax(0,1fr)] gap-3 border border-border bg-card p-2 transition hover:border-accent hover:bg-card-hover">
                  <div className="flex h-20 w-14 items-center justify-center overflow-hidden bg-background">
                    {cover ? <Image unoptimized src={cover} width={56} height={80} alt="" className="h-full w-full object-contain" /> : <span className="px-1 text-center text-[8px] uppercase text-muted">Sin portada verificada</span>}
                  </div>
                  <span className="min-w-0 self-center">
                    <span className="block text-xs font-semibold leading-5 text-foreground">{edition.label}</span>
                    <span className="block text-[11px] text-muted">{catalogBroadRegionLabel(edition.broadRegion)}</span>
                    {ownedCount ? <span className="block text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">Tengo {ownedCount}</span> : null}
                  </span>
                </a>
              );
            })}
          </nav>
        ) : null}

        <div className="mt-5 divide-y divide-border border-y border-border">
          {regions.map((region) => {
            const editions = visibleEditions.filter((edition) => edition.broadRegion === region);
            return (
              <section key={region} className="py-5 first:pt-4">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-lg font-bold text-foreground">{catalogBroadRegionLabel(region)}</h3>
                  <span className="text-xs text-muted">{editions.length} {editions.length === 1 ? "edición" : "ediciones"}</span>
                </div>
                <div className="divide-y divide-border/70">
                  {editions.map((edition) => (
                    <PhysicalEditionRow
                      key={edition.id}
                      edition={edition}
                      guide={guide}
                      family={currentFamily}
                      terminology={hasFamilyVariants ? "variant" : "edition"}
                      isLoggedIn={isLoggedIn}
                      ownedCount={physicalVariantOwnedCounts[edition.id] ?? 0}
                      loginPath={loginPath}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <ReferenceSection guide={guide} images={[]} />
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
  ownedCount,
  loginPath,
}: {
  edition: CatalogPhysicalEdition;
  guide: CatalogEditionGuideModel;
  family?: CatalogEditionFamily;
  terminology: "edition" | "variant";
  isLoggedIn: boolean;
  ownedCount: number;
  loginPath: string;
}) {
  const sharedDisc = guide.sharedDiscs.find((disc) => disc.id === edition.sharedDiscId);
  const cover = physicalEditionCover(edition);
  const linkedCatalogGame = edition.catalogIds.flatMap((id) => {
    const game = getCatalogGame(id);
    return game ? [game] : [];
  })[0];
  const priceRows = linkedCatalogGame
    ? catalogConditionPriceRows(linkedCatalogGame).filter((row) => row.price != null)
    : [];
  const collectionCatalogId = linkedCatalogGame?.id ?? family?.representativeCatalogId;
  const includedEditions = edition.includesEditionIds.flatMap((id) => {
    const target = guide.physicalEditions.find((candidate) => candidate.id === id);
    return target ? [target.label] : [];
  });
  return (
    <article id={edition.id} className="scroll-mt-28 py-4 outline-none target:bg-accent/5 target:outline target:outline-2 target:outline-accent/50 first:pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-semibold text-foreground">{edition.label}</h4>
        <Badge tone={edition.editionType === "STANDARD" ? undefined : "amber"}>
          {catalogPhysicalEditionTypeLabel(edition.editionType)}
        </Badge>
        {edition.id === guide.currentEditionId ? <Badge tone="green">Esta ficha</Badge> : null}
        {ownedCount ? <Badge tone="green">Tengo {ownedCount}</Badge> : null}
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-[132px_minmax(0,1fr)]">
        <div className="flex aspect-[3/4] w-full max-w-[132px] items-center justify-center overflow-hidden border border-border bg-background">
          {cover ? (
            <Image unoptimized src={cover} width={132} height={176} alt={`Portada de ${edition.label}`} className="h-full w-full object-contain" />
          ) : (
            <span className="px-3 text-center text-[10px] font-semibold uppercase leading-4 text-muted">Portada pendiente de evidencia</span>
          )}
        </div>
        <div className="min-w-0">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {edition.packagingLanguages.length ? <Fact label="Idiomas del packaging" value={edition.packagingLanguages.join(" / ")} /> : null}
            {edition.ratingSystems.length ? <Fact label="Clasificación impresa" value={edition.ratingSystems.join(" + ")} /> : null}
            {edition.barcode ? <Fact label="EAN / UPC / JAN" value={edition.barcode} mono /> : null}
            {edition.catalogNumber ? <Fact label="Referencia del soporte" value={edition.catalogNumber} mono /> : null}
            {edition.boxCode ? <Fact label="Código de caja" value={edition.boxCode} mono /> : null}
            {sharedDisc ? <Fact label="Soporte compartido" value={`${sharedDisc.label}${sharedDisc.ratingSystems.length ? ` · ${sharedDisc.ratingSystems.join(" + ")}` : ""}`} /> : null}
            <Fact
              label={terminology === "edition" ? "Precio de esta edición" : "Precio de esta variante"}
              value={priceRows.length
                ? priceRows.map((row) => `${row.label}: ${formatEur(row.price)}`).join(" · ")
                : "Pendiente"}
            />
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
          ) : <p className="mt-3 text-xs text-muted">Variante física documentada sin ficha de catálogo independiente.</p>}

          {includedEditions.length || edition.physicalContents.length || edition.digitalContents.length ? (
            <div className="mt-4 border-l-2 border-accent/40 pl-3 text-sm leading-6">
              {includedEditions.length ? <p><strong>Incluye:</strong> {includedEditions.join(" · ")}</p> : null}
              {edition.physicalContents.length ? <p><strong>Contenido físico:</strong> {edition.physicalContents.join(" · ")}</p> : null}
              {edition.digitalContents.length ? <p><strong>Contenido digital:</strong> {edition.digitalContents.join(" · ")}</p> : null}
            </div>
          ) : null}

          {family && collectionCatalogId ? (
            <div className="mt-4">
              <PhysicalVariantCollectionToggle
                catalogId={collectionCatalogId}
                physicalVariantId={edition.id}
                label={edition.label}
                terminology={terminology}
                initialOwnedCount={ownedCount}
                isLoggedIn={isLoggedIn}
                loginPath={loginPath}
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
      <EvidenceList evidence={edition.evidence} />
      {edition.scanSetIds.map((scanSetId) => <ScanSetGallery key={scanSetId} scanSetId={scanSetId} />)}
    </article>
  );
}

function DimensionsComparison({ dimensions }: { dimensions: NonNullable<CatalogPhysicalEdition["dimensions"]> }) {
  const comparison = dimensions.comparison;
  const difference = comparison ? {
    widthCm: dimensions.widthCm - comparison.widthCm,
    heightCm: dimensions.heightCm - comparison.heightCm,
    depthCm: dimensions.depthCm - comparison.depthCm,
  } : null;
  const formatCm = (value: number) => `${value.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} cm`;
  const formatDifference = (value: number) => `${value >= 0 ? "+" : ""}${formatCm(value)}`;
  return (
    <div className="mt-4 border-y border-border/70 py-3">
      <p className="text-xs font-semibold uppercase text-muted">Medidas exteriores {dimensions.approximate ? "aproximadas" : ""}</p>
      <dl className="mt-2 grid grid-cols-3 gap-3 text-sm">
        <Fact label="ANCHO" value={formatCm(dimensions.widthCm)} />
        <Fact label="ALTO" value={formatCm(dimensions.heightCm)} />
        <Fact label="PROFUNDO" value={formatCm(dimensions.depthCm)} />
      </dl>
      {comparison && difference ? (
        <div className="mt-3 text-xs leading-5 text-muted">
          <p>
            Frente a {comparison.label.toLowerCase()} ({formatCm(comparison.widthCm)} × {formatCm(comparison.heightCm)} × {formatCm(comparison.depthCm)}): {formatDifference(difference.widthCm)} de ancho, {formatDifference(difference.heightCm)} de alto y {formatDifference(difference.depthCm)} de profundidad.
          </p>
          <a href={comparison.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">
            {comparison.sourceLabel}
          </a>
        </div>
      ) : null}
      <p className="mt-2 text-xs leading-5 text-muted">{dimensions.sourceLabel}</p>
      {dimensions.notes.map((note) => <p key={note} className="text-xs leading-5 text-muted">{note}</p>)}
    </div>
  );
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><dt className="font-semibold text-foreground">{label}</dt><dd className={mono ? "font-mono text-muted" : "text-muted"}>{value}</dd></div>;
}

function EvidenceList({ evidence }: { evidence: CatalogPhysicalEdition["evidence"] }) {
  if (!evidence.length) return null;
  return (
    <details className="mt-4 border-t border-border/70 pt-3">
      <summary className="cursor-pointer text-sm font-semibold">Evidencia y procedencia</summary>
      <ul className="mt-3 divide-y divide-border/60">
        {evidence.map((entry) => (
          <li key={entry.id} className="py-2 text-xs leading-5 first:pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-foreground">{entry.label}</span>
              <span className={isStrongPhysicalEvidence(entry.type) ? "text-emerald-700 dark:text-emerald-300" : "text-muted"}>
                {EVIDENCE_LABELS[entry.type]}
              </span>
            </div>
            {entry.summary ? <p className="text-muted">{entry.summary}</p> : null}
            {entry.url ? <a href={entry.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">Consultar fuente</a> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

function ScanSetGallery({ scanSetId }: { scanSetId: string }) {
  const scans = getOwnedScanSetById(scanSetId);
  if (!scans) return null;
  return (
    <details className="mt-4 border-t border-border/70 pt-3" open>
      <summary className="cursor-pointer text-sm font-semibold">Escaneos físicos del ejemplar ({scans.images.length})</summary>
      <p className="mt-2 text-xs leading-5 text-muted">{scans.packaging.marketEvidence}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {scans.images.map((asset) => (
          <figure key={asset.url} className="min-w-0 border border-border p-2">
            <a href={asset.url} target="_blank" rel="noopener noreferrer" aria-label={`Ampliar ${asset.label.toLowerCase()}`}>
              <Image unoptimized src={asset.thumbnailUrl} width={asset.width} height={asset.height} alt={asset.label} className="h-40 w-full object-contain" />
            </a>
            <figcaption className="mt-2 text-xs leading-5 text-muted">{asset.label}</figcaption>
          </figure>
        ))}
      </div>
    </details>
  );
}

function ReferenceSection({ guide, images }: { guide: CatalogEditionGuideModel; images: CatalogEditionGuideModel["physicalEditions"][number]["images"] }) {
  if (!images.length && !guide.sources.length && !guide.evidenceNote) return null;
  return (
    <details className="mt-4 border-t border-border pt-3">
      <summary className="cursor-pointer text-sm font-semibold">Imágenes de referencia y fuentes</summary>
      {images.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {images.map((image) => (
          <figure key={image.key} className="min-w-0 border border-border p-2">
            <a href={image.url} target="_blank" rel="noopener noreferrer" aria-label={`Ampliar: ${image.caption}`}>
              <Image unoptimized src={image.thumbnailUrl} width={image.width} height={image.height} alt={image.caption} className="h-44 w-full object-contain" />
            </a>
            <figcaption className="mt-2 text-xs leading-5 text-muted">{image.caption}</figcaption>
            {!isStrongPhysicalEvidence(image.evidenceType) ? <p className="mt-1 text-[11px] text-muted">Referencia visual; no determina por sí sola una variante física.</p> : null}
          </figure>
        ))}
      </div> : null}
      <p className="mt-3 text-xs leading-5 text-muted">{guide.evidenceNote}</p>
      {guide.sources.length ? <ul className="mt-2 space-y-2 text-xs">
        {guide.sources.map((source) => <li key={`${source.label}:${source.url ?? "internal"}`}>{source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{source.label}</a> : source.label}</li>)}
      </ul> : null}
    </details>
  );
}
