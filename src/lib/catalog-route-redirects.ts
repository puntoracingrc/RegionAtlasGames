import routeRedirectsData from "../../data/catalog-route-redirects.json";

export type CatalogRouteRedirectReason = "same_product" | "wrong_platform";

export type CatalogRouteRedirect = {
  sourceParams: string[];
  targetCatalogId: string;
  targetParam: string;
  permanent: true;
  reason: CatalogRouteRedirectReason;
  reviewedAt: string;
  reviewBatch: string;
};

type CatalogRouteRedirectIndex = {
  schemaVersion: 1;
  batchId: string;
  redirects: CatalogRouteRedirect[];
};

const index = routeRedirectsData as CatalogRouteRedirectIndex;
const redirectsByParam = new Map<string, CatalogRouteRedirect>();

function decoded(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

for (const redirect of index.redirects) {
  for (const sourceParam of redirect.sourceParams) {
    redirectsByParam.set(sourceParam, redirect);
    redirectsByParam.set(decoded(sourceParam), redirect);
  }
}

export function getCatalogRouteRedirect(param: string): CatalogRouteRedirect | undefined {
  return redirectsByParam.get(param) ?? redirectsByParam.get(decoded(param));
}

export function getCatalogRedirectTargetIdForCatalogId(
  catalogId: string,
): string | undefined {
  return getCatalogRouteRedirect(catalogId)?.targetCatalogId;
}
