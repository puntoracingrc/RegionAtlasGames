import type { Metadata } from "next";
import { SiteNav } from "@/components/site-nav";
import { VitrinaMarketplace } from "@/components/vitrina-marketplace";
import { getVitrinaBrowseResult } from "@/lib/vitrina-browse";
import { getCurrentUser } from "@/lib/users";
import {
  DEFAULT_VITRINA_FILTERS,
  VITRINA_INITIAL_RESULT_COUNT,
  type VitrinaDelivery,
  type VitrinaFilters,
  type VitrinaSort,
} from "@/lib/vitrina-marketplace";
import type { CollectionCondition } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vitrina de juegos en venta | Region Atlas",
  description: "Juegos físicos publicados por coleccionistas de Region Atlas, con búsqueda por plataforma, estado, región y entrega.",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const CONDITIONS = new Set<CollectionCondition>(["sealed", "complete", "game-manual", "loose", "unknown"]);
const DELIVERIES = new Set<VitrinaDelivery>(["all", "shipping", "pickup"]);
const SORTS = new Set<VitrinaSort>(["recent", "price-asc", "price-desc"]);

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function price(value: string | string[] | undefined): number | null {
  const parsed = Number.parseFloat(first(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function initialFilters(params: Record<string, string | string[] | undefined>): VitrinaFilters {
  const condition = first(params.estado);
  const delivery = first(params.entrega);
  const sort = first(params.orden);
  return {
    ...DEFAULT_VITRINA_FILTERS,
    query: first(params.q).slice(0, 120),
    platform: first(params.plataforma) || "all",
    region: first(params.region) || "all",
    condition: CONDITIONS.has(condition as CollectionCondition)
      ? condition as CollectionCondition
      : "all",
    delivery: DELIVERIES.has(delivery as VitrinaDelivery)
      ? delivery as VitrinaDelivery
      : "all",
    city: first(params.ciudad).slice(0, 80),
    minPrice: price(params.precio_min),
    maxPrice: price(params.precio_max),
    sort: SORTS.has(sort as VitrinaSort) ? sort as VitrinaSort : "recent",
  };
}

export default async function VitrinaPage({ searchParams }: Props) {
  const [user, params] = await Promise.all([
    getCurrentUser(),
    searchParams,
  ]);
  const filters = initialFilters(params);
  const result = await getVitrinaBrowseResult({
    filters,
    pageSize: VITRINA_INITIAL_RESULT_COUNT,
    loggedIn: Boolean(user),
  });

  return (
    <>
      <SiteNav initialUser={user} />
      <VitrinaMarketplace
        listings={result.items}
        total={result.total}
        filterOptions={result.filterOptions}
        initialFilters={filters}
        deferInitialLoad
      />
    </>
  );
}
