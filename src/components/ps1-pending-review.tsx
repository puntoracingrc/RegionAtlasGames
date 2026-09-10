import Image from "next/image";
import Link from "next/link";
import { getCatalogGame } from "@/lib/catalog";
import { catalogGamePath } from "@/lib/catalog-path";
import { ps1CatalogReviewGroup } from "@/lib/catalog-review-policy";
import { getCoverSrc } from "@/lib/cover-url";
import { getPs1VariantReview } from "@/lib/ps1-variant-review";
import type { CatalogGame } from "@/lib/types";

const RANGE_LABELS = { platinum: "Platinum", "greatest-hits": "Greatest Hits", "long-box": "Long Box" };
const CHECKS = {
  platinum: "Comprueba la banda Platinum, el lomo, la contraportada y los códigos impresos. El idioma del juego no determina el país de la caja.",
  "greatest-hits": "Comprueba la banda Greatest Hits, los logotipos, el lomo y los códigos de caja y disco. Un código compartido con la edición original no confirma la reedición.",
  "long-box": "Comprueba el formato de caja larga, su construcción y el diseño de portada, lomo y contraportada. El mismo juego puede existir también en caja de CD estándar.",
};

export function Ps1PendingReview({ game }: { game: CatalogGame }) {
  const group = ps1CatalogReviewGroup(game.id);
  const variant = getPs1VariantReview(game.id);
  if (!group && !variant) return null;
  const groupGames = group?.catalogIds.filter((id) => id !== game.id).map(getCatalogGame).filter((g): g is CatalogGame => Boolean(g)) ?? [];
  return (
    <div className="mt-4 space-y-4">
      {group ? (
        <div className="rounded-xl border border-border bg-background/50 p-4">
          <h3 className="text-sm font-semibold">{group.decision === "group_names" ? "Nombres agrupados en el catálogo" : "Ediciones que deben distinguirse"}</h3>
          <p className="mt-2 text-sm leading-6 text-muted">{group.note}</p>
          <ul className="mt-2 space-y-1 text-sm">
            {groupGames.map((other) => <li key={other.id}><Link href={catalogGamePath(other)} className="text-accent underline">{other.title}</Link></li>)}
          </ul>
          <p className="mt-2 text-xs text-muted">{group.sourceUrls.map((url, i) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="mr-3 underline">PSX Datacenter{group.sourceUrls.length > 1 ? ` · ${i + 1}` : ""}</a>)}</p>
        </div>
      ) : null}
      {variant ? (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
          <h3 className="text-sm font-semibold">{RANGE_LABELS[variant.kind]} · Caja pendiente de contrastar</h3>
          <p className="mt-2 text-sm leading-6 text-muted">{CHECKS[variant.kind]} También deben coincidir el manual y los discos incluidos.</p>
          {variant.references.length ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold">Referencias de esta variante para comparar ({variant.references.length})</summary>
              <p className="mt-2 text-xs leading-5 text-muted">La fuente etiqueta estas imágenes como {RANGE_LABELS[variant.kind]} en publicaciones con un título coincidente. Son referencias de investigación: todavía no están vinculadas a la edición exacta de esta ficha.</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {variant.references.map((asset) => {
                  const src = asset.stored ? getCoverSrc(asset.url) : null;
                  const label = /back/i.test(asset.label ?? "") ? "Contraportada" : "Portada";
                  return <figure key={`${asset.assetId}:${asset.sourceUrl}:${asset.label}`} className="min-w-0 rounded-lg border border-border bg-card p-2">
                    {src ? <a href={src} target="_blank" rel="noopener noreferrer" aria-label={`Ampliar ${label.toLowerCase()} de referencia ${RANGE_LABELS[variant.kind]}`}><Image unoptimized src={src} alt={`${label} de referencia ${RANGE_LABELS[variant.kind]}; asignación pendiente`} width={asset.width ?? 300} height={asset.height ?? 300} className="h-40 w-full object-contain" /></a> : <p className="flex h-20 items-center text-xs text-muted">Imagen disponible para consultar en la fuente</p>}
                    <figcaption className="mt-2 space-y-1 text-xs text-muted">
                      <p>{label} · {RANGE_LABELS[variant.kind]}</p>
                      <p>Mercado indicado: {asset.marketHints.join(" / ") || "por confirmar"}</p>
                      <a href={asset.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-block underline">Fuente: PSX Datacenter</a>
                    </figcaption>
                  </figure>;
                })}
              </div>
            </details>
          ) : <p className="mt-3 text-xs leading-5 text-muted">La revisión no ha encontrado una portada o contraportada etiquetada expresamente con esta variante. Sigue pendiente localizar y contrastar su embalaje.</p>}
        </div>
      ) : null}
    </div>
  );
}
