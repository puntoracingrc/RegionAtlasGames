import Image from "next/image";
import Link from "next/link";
import { Panel, PanelTitle } from "@/components/ui";
import { getCatalogEditionGuide } from "@/lib/catalog-edition-guides";
import type { CatalogGame } from "@/lib/types";

export function CatalogEditionGuide({ game }: { game: CatalogGame }) {
  const guide = getCatalogEditionGuide(game);
  if (!guide) return null;
  return (
    <Panel>
      <section aria-label={guide.title}>
        <PanelTitle>{guide.title}</PanelTitle>
        <ul className="mt-3 divide-y divide-border">
          {guide.editions.map(edition => (
            <li key={edition.catalogId} className="py-3 first:pt-0">
              <Link href={edition.href} prefetch={false} aria-current={edition.current ? "page" : undefined} className="font-semibold text-primary underline-offset-4 hover:underline">
                {edition.label}
              </Link>
              {edition.current ? <span className="ml-2 text-xs text-muted">Esta ficha</span> : null}
              <p className="mt-1 text-sm leading-6 text-muted">{edition.description}</p>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs leading-5 text-muted">{guide.note}</p>
        <details className="mt-4 border-t border-border pt-3">
          <summary className="cursor-pointer text-sm font-semibold">Imágenes de referencia y fuentes</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {guide.images.map(image => (
              <figure key={image.key} className="min-w-0 rounded-lg border border-border p-2">
                <a href={image.url} target="_blank" rel="noopener noreferrer" aria-label={`Ampliar: ${image.caption}`}>
                  <Image unoptimized src={image.thumbnailUrl} width={image.width} height={image.height} alt={image.caption} className="h-44 w-full object-contain" />
                </a>
                <figcaption className="mt-2 text-xs leading-5 text-muted">{image.caption}</figcaption>
              </figure>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-muted">{guide.evidenceNote}</p>
          <ul className="mt-2 space-y-2 text-xs">
            {guide.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{source.label}</a></li>)}
          </ul>
        </details>
      </section>
    </Panel>
  );
}
