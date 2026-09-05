import type { BreadcrumbItem } from "@/components/breadcrumbs";
import type { IndexEntitySummary } from "@/lib/index-entity";
import { INDEX_KIND_META } from "@/lib/index-entity";
import { getSiteUrl } from "@/lib/site-url";

type IndexEntityJsonLdSummary = Pick<
  IndexEntitySummary,
  "kind" | "name" | "slug" | "catalogEntryCount"
>;

function absoluteUrl(base: string, path: string): string {
  return new URL(path, `${base}/`).toString();
}

export function buildIndexEntityJsonLd(
  summary: IndexEntityJsonLdSummary,
  breadcrumbs: BreadcrumbItem[],
  base = getSiteUrl(),
) {
  const meta = INDEX_KIND_META[summary.kind];
  const currentPath = `${meta.basePath}/${summary.slug}`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: summary.name,
      url: absoluteUrl(base, currentPath),
      mainEntity: {
        "@type": "ItemList",
        name: `Fichas catalogadas de ${summary.name}`,
        numberOfItems: summary.catalogEntryCount,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbs.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.label,
        item: absoluteUrl(base, item.href ?? currentPath),
      })),
    },
  ] as const;
}

export function IndexEntityJsonLd({
  summary,
  breadcrumbs,
}: {
  summary: IndexEntityJsonLdSummary;
  breadcrumbs: BreadcrumbItem[];
}) {
  const data = buildIndexEntityJsonLd(summary, breadcrumbs);

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replaceAll("<", "\\u003c") }}
    />
  );
}
