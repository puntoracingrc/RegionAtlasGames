import Link from "next/link";
import { BackLink } from "@/components/breadcrumbs";
import type { IndexEntitySummary } from "@/lib/index-entity";
import { INDEX_KIND_META, indexEntitySubtitle } from "@/lib/index-entity";
import { companyEntityWikidataUrl } from "@/lib/company-canonical";

export function IndexEntityHeader({ summary }: { summary: IndexEntitySummary }) {
  const meta = INDEX_KIND_META[summary.kind];

  return (
    <header className="mt-4 mb-8 space-y-4">
      <BackLink href={meta.basePath}>{meta.backLabel}</BackLink>
      <h1 className="text-4xl font-bold text-foreground">
        {summary.kind === "series" ? `Saga ${summary.name}` : summary.name}
      </h1>
      <p className="text-foreground/85">{indexEntitySubtitle(summary)}</p>
      {summary.kind === "series" && (
        <p className="max-w-3xl text-sm leading-6 text-foreground/75">
          También puedes leer estas agrupaciones como franquicias: juegos conectados por marca,
          universo, personajes, numeración o continuidad editorial.
        </p>
      )}
      {summary.kind === "company" && summary.alsoKnownAs && summary.alsoKnownAs.length > 0 && (
        <p className="max-w-3xl text-sm text-foreground/75">
          También indexada como{" "}
          {summary.alsoKnownAs.slice(0, 5).join(" · ")}
          {summary.alsoKnownAs.length > 5 ? " · …" : ""}
        </p>
      )}
      {summary.kind === "company" && summary.wikidataId && (
        <p className="text-sm">
          <Link
            href={companyEntityWikidataUrl(summary.wikidataId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            Wikidata ({summary.wikidataId})
          </Link>
        </p>
      )}
      {summary.platforms.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {summary.platforms.map((platform) => (
            <span
              key={platform.slug}
              className="rounded-full border border-border bg-card-hover px-3 py-1 text-xs text-foreground/80 dark:border-transparent dark:bg-white/10"
            >
              {platform.name}: {platform.count.toLocaleString("es-ES")}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}
