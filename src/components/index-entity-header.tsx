import { BackLink } from "@/components/breadcrumbs";
import type { IndexEntitySummary } from "@/lib/index-entity";
import { INDEX_KIND_META, indexEntitySubtitle } from "@/lib/index-entity";

export function IndexEntityHeader({ summary }: { summary: IndexEntitySummary }) {
  const meta = INDEX_KIND_META[summary.kind];

  return (
    <header className="mt-4 mb-8 space-y-4">
      <BackLink href={meta.basePath}>{meta.backLabel}</BackLink>
      <h1 className="text-4xl font-bold text-foreground">{summary.name}</h1>
      <p className="text-muted">{indexEntitySubtitle(summary)}</p>
      {summary.platforms.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {summary.platforms.map((platform) => (
            <span
              key={platform.slug}
              className="rounded-full bg-white/10 px-3 py-1 text-xs text-foreground/80"
            >
              {platform.name}: {platform.count.toLocaleString("es-ES")}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}
