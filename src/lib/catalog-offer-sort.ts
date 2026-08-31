export type OfferCoordinates = {
  latitude: number;
  longitude: number;
};

export type CatalogOfferSortValue = {
  id: string;
  priceEur: number | null;
  listedAt: string | null;
  location: OfferCoordinates | null;
};

export type CatalogOfferSortMode = "price" | "date" | "distance";

function timestamp(value: string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function offerDistanceKm(from: OfferCoordinates, to: OfferCoordinates): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6_371;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const fromLatitude = radians(from.latitude);
  const toLatitude = radians(to.latitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function sortCatalogOffers<T extends CatalogOfferSortValue>(
  offers: T[],
  mode: CatalogOfferSortMode,
  buyerLocation: OfferCoordinates | null,
): T[] {
  return [...offers].sort((left, right) => {
    if (mode === "price") {
      const leftPrice = left.priceEur ?? Number.POSITIVE_INFINITY;
      const rightPrice = right.priceEur ?? Number.POSITIVE_INFINITY;
      return leftPrice - rightPrice || timestamp(right.listedAt) - timestamp(left.listedAt);
    }

    if (mode === "distance" && buyerLocation) {
      const leftDistance = left.location
        ? offerDistanceKm(buyerLocation, left.location)
        : Number.POSITIVE_INFINITY;
      const rightDistance = right.location
        ? offerDistanceKm(buyerLocation, right.location)
        : Number.POSITIVE_INFINITY;
      return leftDistance - rightDistance || timestamp(right.listedAt) - timestamp(left.listedAt);
    }

    return timestamp(right.listedAt) - timestamp(left.listedAt);
  });
}
