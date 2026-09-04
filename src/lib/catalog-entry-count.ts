export function formatCatalogEntryCount(count: number): string {
  return `${count.toLocaleString("es-ES")} ${count === 1 ? "ficha" : "fichas"}`;
}
