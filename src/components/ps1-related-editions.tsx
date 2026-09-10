import Image from "next/image";
import Link from "next/link";
import { RegionFlag } from "@/components/region-flag";
import { catalogGamePath } from "@/lib/catalog-path";
import { getCoverSrc } from "@/lib/cover-url";
import { languageNames } from "@/lib/ps1-regional";
import type { CatalogGame } from "@/lib/types";

function EditionCards({ editions }: { editions: CatalogGame[] }) {
  return <ul className="mt-3 grid gap-3 sm:grid-cols-2">
    {editions.map((edition) => {
      const src = getCoverSrc(edition.coverUrl);
      return <li key={edition.id} className="min-w-0">
        <Link href={catalogGamePath(edition)} className="flex h-full gap-3 rounded-xl border border-border p-3 transition hover:border-accent/50 hover:bg-accent/5">
          {src ? <Image unoptimized src={src} width={64} height={76} alt={`Portada de ${edition.title} · ${edition.region}`} className="h-20 w-16 shrink-0 object-contain" /> : <span className="flex h-20 w-16 shrink-0 items-center text-center text-[10px] text-muted">Portada pendiente</span>}
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold">{edition.title}</p>
            <p className="text-xs text-muted"><RegionFlag region={edition.region} size="xs" showLabel /></p>
            <p className="break-words font-mono text-[11px] text-muted">{edition.canonicalSerials?.join(" · ")}</p>
            {edition.languages?.length ? <p className="text-xs text-muted">{languageNames(edition.languages)}</p> : null}
          </div>
        </Link>
      </li>;
    })}
  </ul>;
}

export function Ps1RelatedEditions({ game, editions }: { game: CatalogGame; editions: CatalogGame[] }) {
  if (!editions.length) return null;
  if (game.regionalStatus !== "review") return <details className="mt-5 border-t border-border pt-4">
    <summary className="cursor-pointer text-sm font-semibold">Otras ediciones documentadas ({editions.length})</summary>
    <EditionCards editions={editions} />
  </details>;
  const ranked = [...editions].sort((a, b) => {
    const rank = (edition: CatalogGame) => (edition.regionCode === "ES" ? 8 : 0) + (edition.regionFamily === game.regionFamily ? 4 : 0) + (edition.coverUrl ? 2 : 0);
    return rank(b) - rank(a) || a.region.localeCompare(b.region, "es") || a.id.localeCompare(b.id);
  });
  return <section className="mt-5 border-t border-border pt-4" aria-label="Ediciones documentadas de este juego">
    <h3 className="text-base font-semibold">Este juego tiene ediciones documentadas ({editions.length})</h3>
    <p className="mt-2 text-sm leading-6 text-muted">Consulta sus portadas, códigos e idiomas. La relación entre estos juegos está documentada; la caja concreta de esta ficha sigue pendiente.</p>
    <EditionCards editions={ranked.slice(0, 4)} />
    {ranked.length > 4 ? <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-accent">Ver las otras {ranked.length - 4} ediciones</summary><EditionCards editions={ranked.slice(4)} /></details> : null}
  </section>;
}
