export function collectionCatalogPath(catalogId: string): string {
  return `/coleccion/juego/${encodeURIComponent(catalogId)}`;
}
