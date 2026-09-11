import aliasesData from "../../data/catalog-id-aliases.json";

const aliases = aliasesData as Record<string, string>;
const canonicalTargets = new Set(Object.values(aliases));

export function hasConsolidatedCatalogAliases(id: string): boolean {
  return canonicalTargets.has(id);
}

/** Only explicitly reviewed same-product mappings, never title similarity. */
export function canonicalCatalogId(id: string): string {
  const visited = new Set<string>();
  let current = id;
  while (aliases[current] && !visited.has(current)) {
    visited.add(current);
    current = aliases[current];
  }
  return current;
}

export function canonicalCatalogLink<T extends { catalogId: string }>(entry: T): T {
  const catalogId = canonicalCatalogId(entry.catalogId);
  return catalogId === entry.catalogId ? entry : { ...entry, catalogId };
}
