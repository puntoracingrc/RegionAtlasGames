import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/users";
import { getVitrinaBrowseResult } from "@/lib/vitrina-browse";
import {
  DEFAULT_VITRINA_FILTERS,
  VITRINA_PAGE_SIZE,
  type VitrinaDelivery,
  type VitrinaFilters,
  type VitrinaSort,
} from "@/lib/vitrina-marketplace";
import type { CollectionCondition } from "@/lib/types";

const CONDITIONS = new Set<CollectionCondition>(["sealed", "complete", "game-manual", "loose", "unknown"]);
const DELIVERIES = new Set<VitrinaDelivery>(["all", "shipping", "pickup"]);
const SORTS = new Set<VitrinaSort>(["recent", "price-asc", "price-desc"]);

function price(value: string | null): number | null {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function filters(url: URL): VitrinaFilters {
  const condition = url.searchParams.get("estado") ?? "all";
  const delivery = url.searchParams.get("entrega") ?? "all";
  const sort = url.searchParams.get("orden") ?? "recent";
  return {
    ...DEFAULT_VITRINA_FILTERS,
    query: (url.searchParams.get("q") ?? "").slice(0, 120),
    platform: url.searchParams.get("plataforma") ?? "all",
    region: url.searchParams.get("region") ?? "all",
    condition: CONDITIONS.has(condition as CollectionCondition) ? condition as CollectionCondition : "all",
    delivery: DELIVERIES.has(delivery as VitrinaDelivery) ? delivery as VitrinaDelivery : "all",
    city: (url.searchParams.get("ciudad") ?? "").slice(0, 80),
    minPrice: price(url.searchParams.get("precio_min")),
    maxPrice: price(url.searchParams.get("precio_max")),
    sort: SORTS.has(sort as VitrinaSort) ? sort as VitrinaSort : "recent",
  };
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const user = await getCurrentUser();
  const result = await getVitrinaBrowseResult({
    filters: filters(url),
    page,
    pageSize: VITRINA_PAGE_SIZE,
    loggedIn: Boolean(user),
  });
  return NextResponse.json(result, {
    headers: {
      "Cache-Control": user
        ? "private, no-store"
        : "public, s-maxage=30, stale-while-revalidate=120",
      "Server-Timing": `vitrina;dur=${(performance.now() - startedAt).toFixed(1)}`,
    },
  });
}
