import Link from "next/link";
import { PlatformCardArt } from "@/components/platform-card-art";
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import { RegionFlag } from "@/components/region-flag";
import { formatCatalogEntryCount } from "@/lib/catalog-entry-count";
import type { CollectionView, Platform } from "@/lib/types";
import { getPlatformRegions, getPlatformStats } from "@/lib/catalog";

const HOVER_LIFT =
  "transition-all duration-200 ease-out hover:-translate-y-1.5 hover:shadow-xl hover:shadow-black/45";

const MANUFACTURER_STYLE = {
  nintendo: "from-red-500/20 to-red-500/5 border-red-400/20",
  sony: "from-blue-500/20 to-blue-500/5 border-blue-400/20",
  microsoft: "from-emerald-500/20 to-emerald-500/5 border-emerald-400/20",
  sega: "from-indigo-500/20 to-indigo-500/5 border-indigo-400/20",
  snk: "from-cyan-500/20 to-cyan-500/5 border-cyan-400/20",
};

export function PlatformCard({
  platform,
  ownedItems = [],
}: {
  platform: Platform;
  ownedItems?: CollectionView[];
}) {
  const stats = getPlatformStats(platform.slug, ownedItems);
  const regions = getPlatformRegions(platform.slug);
  const listedLabel = `${formatCatalogEntryCount(stats.catalogEntryCount)} ${
    stats.catalogEntryCount === 1 ? "catalogada" : "catalogadas"
  }`;

  return (
    <Link
      href={`/plataforma/${platform.slug}`}
      className={`group relative min-h-[168px] overflow-hidden rounded-xl border bg-gradient-to-br p-4 ${HOVER_LIFT} hover:border-white/25 ${MANUFACTURER_STYLE[platform.manufacturer]}`}
    >
      <PlatformCardArt platform={platform} />

      <div className="relative z-10 flex max-w-[calc(100%-6.25rem)] items-start justify-between gap-2">
        <div>
          <ManufacturerLogo manufacturer={platform.manufacturer} />
          <h3 className="mt-1 text-xl font-bold text-foreground">{platform.shortName}</h3>
          {platform.spainReleaseYear ? (
            <p className="mt-1 text-[11px] font-semibold text-muted/90">
              Desde {platform.spainReleaseYear} en España
            </p>
          ) : null}
        </div>
      </div>

      {regions.length > 0 && (
        <div
          className="relative z-10 mt-3 flex max-w-[calc(100%-5.5rem)] flex-wrap gap-1.5"
          aria-label="Regiones disponibles"
        >
          {regions.map((region) => (
            <span
              key={region}
              className="inline-flex min-h-7 items-center rounded-full border border-border/60 bg-card/60 px-2"
            >
              <RegionFlag region={region} size="xs" showLabel labelMode="short" />
            </span>
          ))}
        </div>
      )}

      <div className="relative z-10 mt-4 space-y-2">
        <p className="text-xs text-muted">{listedLabel}</p>
        {stats.owned > 0 && (
          <p className="text-xs text-accent/90">
            Tienes {stats.owned} en tu colección
          </p>
        )}
      </div>
    </Link>
  );
}

export function PlatformGrid({
  items,
  ownedItems = [],
}: {
  items: Platform[];
  ownedItems?: CollectionView[];
}) {
  const manufacturerOrder = new Map<Platform["manufacturer"], number>();
  for (const platform of items) {
    if (!manufacturerOrder.has(platform.manufacturer)) {
      manufacturerOrder.set(platform.manufacturer, manufacturerOrder.size);
    }
  }

  const sortedItems = [...items].sort((a, b) => {
    const manufacturerDelta =
      (manufacturerOrder.get(a.manufacturer) ?? Number.MAX_SAFE_INTEGER) -
      (manufacturerOrder.get(b.manufacturer) ?? Number.MAX_SAFE_INTEGER);
    if (manufacturerDelta !== 0) return manufacturerDelta;

    const releaseYearDelta =
      (a.spainReleaseYear ?? Number.MAX_SAFE_INTEGER) -
      (b.spainReleaseYear ?? Number.MAX_SAFE_INTEGER);
    if (releaseYearDelta !== 0) return releaseYearDelta;

    return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es");
  });

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {sortedItems.map((p) => (
        <PlatformCard key={p.slug} platform={p} ownedItems={ownedItems} />
      ))}
    </div>
  );
}
