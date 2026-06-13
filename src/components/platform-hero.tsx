import Link from "next/link";
import type { CatalogGame, CollectionView, Platform } from "@/lib/types";
import { formatEur, getPlatformStats } from "@/lib/catalog";
import {
  buildPlatformCatalogInsights,
  regionBarColor,
} from "@/lib/platform-catalog-insights";
import { PlatformPriceCoverage } from "@/components/platform-price-sync-banner";

const MANUFACTURER_STYLE = {
  nintendo: "from-red-500/15 via-red-500/5 to-transparent border-red-400/25",
  sony: "from-blue-500/15 via-blue-500/5 to-transparent border-blue-400/25",
  sega: "from-indigo-500/15 via-indigo-500/5 to-transparent border-indigo-400/25",
} as const;

type Props = {
  platform: Platform;
  games: CatalogGame[];
  ownedItems: CollectionView[];
};

export function PlatformHero({ platform, games, ownedItems }: Props) {
  const stats = getPlatformStats(platform.slug, ownedItems);
  const ownedOnPlatform = ownedItems.filter((c) => c.platformSlug === platform.slug);
  const insights = buildPlatformCatalogInsights(games);
  const collectionValue = ownedOnPlatform.reduce((s, g) => s + (g.totalValue || 0), 0);
  const gradient = MANUFACTURER_STYLE[platform.manufacturer];

  return (
    <header className="mb-8 space-y-4">
      <Link href="/plataformas" className="text-sm text-muted hover:text-accent">
        ← Plataformas
      </Link>

      <div
        className={`overflow-hidden rounded-2xl border bg-gradient-to-br ${gradient} bg-card shadow-sm`}
      >
        <div className="p-5 md:p-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">
                {platform.manufacturer}
              </p>
              <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                {platform.name}
              </h1>
              <p className="max-w-xl text-sm leading-relaxed text-muted line-clamp-2">
                {platform.description}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap gap-4 lg:justify-end">
              <CountStat label="Títulos" value={stats.listed.toLocaleString("es-ES")} />
              <RingStat
                label="Precios ES"
                value={insights.withEsPrice.toLocaleString("es-ES")}
                pct={insights.pricePct}
              />
              <RingStat
                label="Portadas"
                value={insights.withCover.toLocaleString("es-ES")}
                pct={insights.coverPct}
              />
              {stats.owned > 0 && (
                <RingStat label="Tu colección" value={String(stats.owned)} pct={stats.completion} accent="emerald" />
              )}
            </div>
          </div>

          {insights.topRegions.length > 0 && (
            <div className="mt-6 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-muted">
                <span>Regiones en catálogo</span>
                <span>{insights.total.toLocaleString("es-ES")} títulos</span>
              </div>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-foreground/5">
                {insights.topRegions.map((region, i) => (
                  <div
                    key={region.label}
                    className={`${regionBarColor(i)} transition-all`}
                    style={{ width: `${Math.max(region.pct, 0.5)}%` }}
                    title={`${region.shortLabel}: ${region.count}`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {insights.topRegions.map((region, i) => (
                  <span key={region.label} className="inline-flex items-center gap-1.5 text-[11px] text-muted">
                    <span className={`h-2 w-2 rounded-full ${regionBarColor(i)}`} />
                    {region.shortLabel}{" "}
                    <span className="text-foreground/70">{region.pct}%</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {stats.owned > 0 && (
            <p className="mt-4 text-sm text-muted">
              Tu colección en {platform.shortName}:{" "}
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                {stats.owned} títulos · {formatEur(collectionValue)}
              </span>
            </p>
          )}
        </div>

        <PlatformPriceCoverage platformSlug={platform.slug} className="border-t border-border/60" />
      </div>
    </header>
  );
}

function CountStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex h-[3.25rem] min-w-[3.25rem] items-center justify-center rounded-2xl border border-border/80 bg-card/80 px-2">
        <span className="text-base font-bold tabular-nums text-accent">{value}</span>
      </div>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}

function RingStat({
  label,
  value,
  pct,
  accent = "amber",
}: {
  label: string;
  value: string;
  pct: number;
  accent?: "amber" | "emerald";
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  const stroke = accent === "emerald" ? "text-emerald-500" : "text-accent";
  const circumference = 2 * Math.PI * 15.5;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative h-[3.25rem] w-[3.25rem]">
        <svg viewBox="0 0 36 36" className="h-[3.25rem] w-[3.25rem] -rotate-90">
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.12}
            strokeWidth="3"
          />
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            className={stroke}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-foreground">
          {clamped < 100 ? `${clamped % 1 === 0 ? clamped : clamped.toFixed(1)}%` : "✓"}
        </span>
      </div>
      <div className="text-center">
        <p className="text-sm font-bold text-foreground">{value}</p>
        <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      </div>
    </div>
  );
}
