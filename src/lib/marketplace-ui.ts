import type { ListingStatus } from "./marketplace-types";

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  draft: "Borrador",
  active: "Publicado",
  sold: "Vendido",
  cancelled: "Cancelado",
};

export const LISTING_STATUS_HINTS: Record<ListingStatus, string> = {
  draft: "Sube fotos, analiza con IA y publica.",
  active: "Visible en el catálogo. Los compradores Pro pueden contactarte.",
  sold: "Venta cerrada o pendiente de confirmación del comprador.",
  cancelled: "Anuncio retirado. Puedes crear uno nuevo desde tu colección.",
};

export function listingStatusLabel(status: ListingStatus): string {
  return LISTING_STATUS_LABELS[status] ?? status;
}
