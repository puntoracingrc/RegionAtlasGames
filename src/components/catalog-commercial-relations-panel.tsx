import Link from "next/link";
import { Panel, PanelTitle } from "@/components/ui";
import {
  getVerifiedCatalogCompilation,
  getVerifiedCatalogVariant,
  getVerifiedCatalogVariants,
  resolveVerifiedCommercialCanonicalCatalogId,
  type CatalogVariantRelationshipType,
} from "@/lib/catalog-commercial-relations";
import { getCatalogGame, isPublicCatalogGame } from "@/lib/catalog";
import { catalogGamePath } from "@/lib/catalog-url";

const VARIANT_LABELS: Record<CatalogVariantRelationshipType, string> = {
  edition_of: "Edición de",
  bundle_variant_of: "Variante de lote de",
  sibling_edition_of: "Edición relacionada con",
  same_product_candidate: "Posible duplicado de",
};

function gameLink(catalogId: string | null, fallbackTitle: string) {
  if (!catalogId) return <span>{fallbackTitle}</span>;
  const game = getCatalogGame(catalogId);
  if (!game || !isPublicCatalogGame(game)) return <span>{fallbackTitle}</span>;
  return (
    <Link href={catalogGamePath(game)} className="font-semibold text-accent hover:underline">
      {game.title}
    </Link>
  );
}

export function CatalogCommercialRelationsPanel({ catalogId }: { catalogId: string }) {
  const compilation = getVerifiedCatalogCompilation(catalogId);
  const variant = getVerifiedCatalogVariant(catalogId);
  const canonicalCatalogId = resolveVerifiedCommercialCanonicalCatalogId(catalogId);
  const relatedVariants = getVerifiedCatalogVariants(canonicalCatalogId).filter(
    (relation) => relation.variantCatalogId !== catalogId,
  );

  if (!compilation && !variant && relatedVariants.length === 0) return null;

  return (
    <Panel>
      <PanelTitle>Edición y contenido</PanelTitle>

      {variant && (
        <div className="border-b border-border/70 pb-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
            {VARIANT_LABELS[variant.relationshipType]}
          </p>
          <p className="mt-1 text-sm text-foreground">
            {gameLink(variant.canonicalCatalogId, variant.canonicalCatalogId)}
          </p>
        </div>
      )}

      {relatedVariants.length > 0 && (
        <div className={variant ? "border-b border-border/70 py-4" : "border-b border-border/70 pb-4"}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
            Otras ediciones físicas
          </p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {relatedVariants.map((relation) => (
              <li key={relation.variantCatalogId}>
                {gameLink(relation.variantCatalogId, relation.variantCatalogId)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {compilation && (
        <div className={variant || relatedVariants.length > 0 ? "pt-4" : ""}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              Juegos incluidos
            </p>
            <span className="text-xs text-muted">
              {compilation.componentCount} {compilation.componentCount === 1 ? "juego" : "juegos"}
            </span>
          </div>
          <ol className="mt-2 divide-y divide-border/70">
            {compilation.components.map((component) => (
              <li key={`${component.position}:${component.title}`} className="py-3 first:pt-1 last:pb-0">
                <div className="flex gap-3">
                  <span className="w-5 shrink-0 text-right text-xs font-semibold text-muted">
                    {component.position}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">
                      {gameLink(component.catalogId, component.title)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted">
                      Desarrollo: {component.developerCredit} · Publicación: {component.publisherCredit}
                    </p>
                    {component.notes && component.notes !== "Juego completo" && (
                      <p className="text-xs leading-5 text-muted">{component.notes}</p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Panel>
  );
}
