"use client";

import { useState } from "react";
import Link from "next/link";
import type { CatalogGame, CollectionView, Platform } from "@/lib/types";
import { formatEur, getPlatformStats } from "@/lib/catalog";
import { buildPlatformCatalogInsights } from "@/lib/platform-catalog-insights";
import { PlatformRegionBar } from "@/components/platform-region-bar";
import { CatalogBrowser } from "@/components/catalog-browser";

const MANUFACTURER_STYLE = {
  nintendo: "from-red-500/15 via-red-500/5 to-transparent border-red-400/25",
  sony: "from-blue-500/15 via-blue-500/5 to-transparent border-blue-400/25",
  sega: "from-indigo-500/15 via-indigo-500/5 to-transparent border-indigo-400/25",
} as const;

type Props = {
  platform: Platform;
  games: CatalogGame[];
  ownedItems: CollectionView[];
  ownedCatalogIds: string[];
  listingCounts: Record<string, number>;
  isLoggedIn: boolean;
  canViewCollectionValue: boolean;
};

export function PlatformCatalogSection({
  platform,
  games,
  ownedItems,
  ownedCatalogIds,
  listingCounts,
  isLoggedIn,
  canViewCollectionValue,
}: Props) {
  const [region, setRegion] = useState("all");
  const stats = getPlatformStats(platform.slug, ownedItems);
  const ownedOnPlatform = ownedItems.filter((c) => c.platformSlug === platform.slug);
  const insights = buildPlatformCatalogInsights(games);
  const collectionValue = ownedOnPlatform.reduce((s, g) => s + (g.totalValue || 0), 0);
  const gradient = MANUFACTURER_STYLE[platform.manufacturer];

  return (
    <>
      <header className="mb-8 space-y-4">
        <Link href="/plataformas" className="text-sm text-muted hover:text-accent">
          ← Plataformas
        </Link>

        <div
          className={`overflow-hidden rounded-2xl border bg-gradient-to-br ${gradient} bg-card shadow-sm`}
        >
          <div className="p-5 md:p-7">
            <div className="space-y-3">
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

            <PlatformRegionBar
              regions={insights.topRegions}
              total={insights.total}
              selectedRegion={region}
              onSelectRegion={setRegion}
            />

            {stats.owned > 0 && (
              <p className="mt-4 text-sm text-muted">
                Tu colección en {platform.shortName}:{" "}
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {stats.owned} títulos
                  {canViewCollectionValue && ` · ${formatEur(collectionValue)}`}
                </span>
                {!canViewCollectionValue && (
                  <>
                    {" · "}
                    <Link href="/ajustes" className="text-accent hover:underline">
                      Valor total con Pro
                    </Link>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      </header>

      <CatalogBrowser
        games={games}
        contextName={platform.shortName}
        showRegionFilter
        ownedCatalogIds={ownedCatalogIds}
        listingCounts={listingCounts}
        isLoggedIn={isLoggedIn}
        compactLegends
        region={region}
        onRegionChange={setRegion}
      />
    </>
  );
}
