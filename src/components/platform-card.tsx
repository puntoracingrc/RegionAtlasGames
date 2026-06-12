import Link from "next/link";
import type { CollectionView, Platform } from "@/lib/types";
import { getPlatformStats } from "@/lib/catalog";

const HOVER_LIFT =
  "transition-all duration-200 ease-out hover:-translate-y-1.5 hover:shadow-xl hover:shadow-black/45";

const MANUFACTURER_STYLE = {
  nintendo: "from-red-500/20 to-red-500/5 border-red-400/20",
  sony: "from-blue-500/20 to-blue-500/5 border-blue-400/20",
  sega: "from-indigo-500/20 to-indigo-500/5 border-indigo-400/20",
};

export function PlatformCard({
  platform,
  ownedItems = [],
}: {
  platform: Platform;
  ownedItems?: CollectionView[];
}) {
  const stats = getPlatformStats(platform.slug, ownedItems);
  const listedLabel =
    stats.listed === 1
      ? "1 título listado"
      : `${stats.listed.toLocaleString("es-ES")} títulos listados`;

  return (
    <Link
      href={`/plataforma/${platform.slug}`}
      className={`group rounded-xl border bg-gradient-to-br p-4 ${HOVER_LIFT} hover:border-white/25 ${MANUFACTURER_STYLE[platform.manufacturer]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">
            {platform.manufacturer}
          </p>
          <h3 className="mt-1 text-xl font-bold text-foreground">{platform.shortName}</h3>
        </div>
      </div>

      <p className="mt-3 text-sm text-muted line-clamp-2">{platform.description}</p>

      <div className="mt-4 space-y-2">
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
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((p) => (
        <PlatformCard key={p.slug} platform={p} ownedItems={ownedItems} />
      ))}
    </div>
  );
}
