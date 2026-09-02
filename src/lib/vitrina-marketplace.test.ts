import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_VITRINA_FILTERS,
  filterAndSortVitrinaListings,
  hasActiveVitrinaFilters,
  vitrinaFiltersToSearchParams,
  type VitrinaListing,
} from "./vitrina-marketplace";

const listings: VitrinaListing[] = [
  {
    id: "old-cheap",
    catalogId: "game-a",
    title: "Metal Slug",
    catalogHref: "/catalogo/metal-slug",
    contactHref: "/venta/old-cheap",
    coverUrl: null,
    usesSellerPhoto: false,
    photoCount: 2,
    askingPriceEur: 25,
    condition: "complete",
    conditionLabel: "Abierto y completo",
    platformSlug: "neogeo",
    platformName: "Neo Geo AES",
    region: "Occidental",
    regionLabel: "Occidental",
    regionShortLabel: "OCC",
    sellerName: "Ana",
    sellerCity: "Madrid",
    pickup: true,
    shipping: false,
    publishedAt: "2026-08-20T10:00:00.000Z",
  },
  {
    id: "new-expensive",
    catalogId: "game-b",
    title: "Garou: Mark of the Wolves",
    catalogHref: "/catalogo/garou",
    contactHref: "/venta/new-expensive",
    coverUrl: null,
    usesSellerPhoto: false,
    photoCount: 2,
    askingPriceEur: 80,
    condition: "sealed",
    conditionLabel: "Precintado",
    platformSlug: "neogeo-aes-plus",
    platformName: "NEOGEO AES+",
    region: "Japonesa",
    regionLabel: "Japonesa",
    regionShortLabel: "JP",
    sellerName: "Luis",
    sellerCity: "Barcelona",
    pickup: true,
    shipping: true,
    publishedAt: "2026-09-01T10:00:00.000Z",
  },
];

test("Vitrina muestra primero los anuncios más recientes", () => {
  assert.deepEqual(
    filterAndSortVitrinaListings(listings, DEFAULT_VITRINA_FILTERS).map((item) => item.id),
    ["new-expensive", "old-cheap"],
  );
});

test("Vitrina combina plataforma, estado, envío, ciudad y precio", () => {
  const filtered = filterAndSortVitrinaListings(listings, {
    ...DEFAULT_VITRINA_FILTERS,
    query: "garou",
    platform: "neogeo-aes-plus",
    condition: "sealed",
    delivery: "shipping",
    city: "barce",
    minPrice: 50,
    maxPrice: 90,
  });
  assert.deepEqual(filtered.map((item) => item.id), ["new-expensive"]);
});

test("Vitrina ordena por precio y serializa solo filtros activos", () => {
  const filters = {
    ...DEFAULT_VITRINA_FILTERS,
    platform: "neogeo",
    sort: "price-desc" as const,
  };
  assert.deepEqual(
    filterAndSortVitrinaListings(listings, { ...filters, platform: "all" }).map((item) => item.id),
    ["new-expensive", "old-cheap"],
  );
  assert.equal(hasActiveVitrinaFilters(filters), true);
  assert.equal(vitrinaFiltersToSearchParams(filters).toString(), "plataforma=neogeo&orden=price-desc");
});
