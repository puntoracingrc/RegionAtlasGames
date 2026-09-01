export function collectionCatalogPath(catalogId: string): string {
  return `/coleccion/juego/${encodeURIComponent(catalogId)}`;
}

export function collectionCatalogAnchorId(catalogId: string): string {
  return `collection-game-${catalogId.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

export function collectionCatalogReturnPath(catalogId: string): string {
  return `/coleccion#${collectionCatalogAnchorId(catalogId)}`;
}
