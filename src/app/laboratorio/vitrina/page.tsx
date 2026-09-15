import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { VitrinaSimulationLab } from "@/components/vitrina-simulation-lab";
import { catalogGamePath } from "@/lib/catalog-url";
import { getCoverSrc } from "@/lib/cover-url";
import { getPlatform, publicListedCatalog } from "@/lib/catalog";
import { getRegionDisplay, regionDisplayIdentity } from "@/lib/region-display";
import type { CatalogGame } from "@/lib/types";
import type { SimulationCatalogGame } from "@/lib/vitrina-simulation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Laboratorio de Vitrina | Region Atlas",
  description: "Entorno aislado de simulación para validar el mercado entre coleccionistas.",
  robots: { index: false, follow: false },
};

const CATALOG_POOL_SIZE = 720;
let cachedSimulationCatalogPool: SimulationCatalogGame[] | null = null;

function referencePrice(game: CatalogGame): number | null {
  return game.estimatedPriceComplete
    ?? game.recommendedPrice
    ?? game.estimatedPriceLoose
    ?? game.estimatedPriceSealed
    ?? null;
}

function toSimulationGame(game: CatalogGame): SimulationCatalogGame {
  const platform = getPlatform(game.platformSlug);
  const region = getRegionDisplay(game.region);
  return {
    id: game.id,
    title: game.title,
    catalogHref: catalogGamePath(game),
    coverUrl: getCoverSrc(game.coverUrl, game.id),
    platformSlug: game.platformSlug,
    platformName: platform?.shortName || platform?.name || game.platformSlug.toUpperCase(),
    region: game.region,
    regionKey: regionDisplayIdentity(game.region),
    regionLabel: region.label,
    regionShortLabel: region.shortLabel,
    referencePriceEur: referencePrice(game),
  };
}

function simulationCatalogPool(): SimulationCatalogGame[] {
  if (cachedSimulationCatalogPool) return cachedSimulationCatalogPool;

  const candidates = [...publicListedCatalog].sort((left, right) => left.id.localeCompare(right.id));
  const selected: CatalogGame[] = [];
  const selectedIds = new Set<string>();

  const add = (game: CatalogGame | undefined) => {
    if (!game || selectedIds.has(game.id)) return;
    selectedIds.add(game.id);
    selected.push(game);
  };

  const exactReferenceTitle = /\b(absolum|mr\.? nutz)\b/i;
  for (const game of candidates.filter((entry) => exactReferenceTitle.test(entry.title))) {
    add(game);
  }

  const broadReferenceTitle = /\bassassin'?s creed\b/i;
  for (const game of candidates.filter((entry) => broadReferenceTitle.test(entry.title)).slice(0, 90)) {
    add(game);
  }

  const coveredPairs = new Set<string>();
  for (const game of candidates) {
    if (!game.coverUrl) continue;
    const key = `${game.platformSlug}|${regionDisplayIdentity(game.region)}`;
    if (coveredPairs.has(key)) continue;
    coveredPairs.add(key);
    add(game);
  }

  const allPairs = new Set(coveredPairs);
  for (const game of candidates) {
    const key = `${game.platformSlug}|${regionDisplayIdentity(game.region)}`;
    if (allPairs.has(key)) continue;
    allPairs.add(key);
    add(game);
  }

  const remaining = candidates.filter((game) => !selectedIds.has(game.id));
  const remainingSlots = Math.max(0, CATALOG_POOL_SIZE - selected.length);
  const stride = Math.max(1, Math.floor(remaining.length / Math.max(1, remainingSlots)));
  for (let index = 0; index < remaining.length && selected.length < CATALOG_POOL_SIZE; index += stride) {
    add(remaining[index]);
  }

  for (const game of remaining) {
    if (selected.length >= CATALOG_POOL_SIZE) break;
    add(game);
  }

  cachedSimulationCatalogPool = selected.map(toSimulationGame);
  return cachedSimulationCatalogPool;
}

export default function VitrinaSimulationPage() {
  if (process.env.VERCEL_ENV === "production") notFound();

  return (
    <>
      <SiteNav initialStaffRole={null} initialUser={null} />
      <VitrinaSimulationLab catalogGames={simulationCatalogPool()} />
    </>
  );
}
