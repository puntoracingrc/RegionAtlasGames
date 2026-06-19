"use client";

import { useState } from "react";
import Link from "next/link";
import type { CatalogListGame, CollectionView, Platform } from "@/lib/types";
import { BackLink } from "@/components/breadcrumbs";
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import type { PlatformCatalogInsights } from "@/lib/platform-catalog-insights";
import { PlatformRegionBar } from "@/components/platform-region-bar";
import { CatalogBrowser } from "@/components/catalog-browser";
import { PlatformHeroArt } from "@/components/platform-card-art";
import { formatEur } from "@/lib/price-format";
import type { regionOptions } from "@/lib/catalog-filters";

const MANUFACTURER_STYLE = {
  nintendo: "from-red-500/15 via-red-500/5 to-transparent border-red-400/25",
  sony: "from-blue-500/15 via-blue-500/5 to-transparent border-blue-400/25",
  sega: "from-indigo-500/15 via-indigo-500/5 to-transparent border-indigo-400/25",
  snk: "from-cyan-500/15 via-cyan-500/5 to-transparent border-cyan-400/25",
} as const;

type Props = {
  platform: Platform;
  games: CatalogListGame[];
  totalGames: number;
  insights: PlatformCatalogInsights;
  regions: ReturnType<typeof regionOptions>;
  ownedItems: CollectionView[];
  ownedCatalogIds: string[];
  listingCounts: Record<string, number>;
  isLoggedIn: boolean;
  canViewCollectionValue: boolean;
  initialQuery?: string;
  initialRegion?: string;
};

export function PlatformCatalogSection({
  platform,
  games,
  totalGames,
  insights,
  regions,
  ownedItems,
  ownedCatalogIds,
  listingCounts,
  isLoggedIn,
  canViewCollectionValue,
  initialQuery = "",
  initialRegion = "all",
}: Props) {
  const [region, setRegion] = useState(initialRegion);
  const ownedOnPlatform = ownedItems.filter((c) => c.platformSlug === platform.slug);
  const stats = { owned: ownedOnPlatform.length };
  const collectionValue = ownedOnPlatform.reduce((s, g) => s + (g.totalValue || 0), 0);
  const gradient = MANUFACTURER_STYLE[platform.manufacturer];

  return (
    <>
      <header className="mb-8 space-y-4">
        <BackLink href="/plataformas">Plataformas</BackLink>

        <div className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${gradient} bg-card shadow-sm`}>
          <PlatformHeroArt platform={platform} />

          <div className="relative z-10 p-5 md:p-7">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1 space-y-3 md:max-w-[calc(100%-17rem)] lg:max-w-[calc(100%-21rem)]">
                <ManufacturerLogo manufacturer={platform.manufacturer} />
                <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                  {platform.name}
                </h1>
                <p className="max-w-xl text-sm leading-relaxed text-muted line-clamp-2">
                  {platform.description}
                </p>
              </div>
            </div>

            <div className="md:max-w-[calc(100%-17rem)] lg:max-w-[calc(100%-21rem)]">
              <PlatformRegionBar
                regions={insights.topRegions}
                total={insights.total}
                selectedRegion={region}
                onSelectRegion={setRegion}
              />
            </div>

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
        source={{ kind: "platform", slug: platform.slug }}
        totalCount={totalGames}
        regions={regions}
        showRegionFilter
        ownedCatalogIds={ownedCatalogIds}
        listingCounts={listingCounts}
        isLoggedIn={isLoggedIn}
        compactLegends
        initialQuery={initialQuery}
        region={region}
        onRegionChange={setRegion}
      />
    </>
  );
}
