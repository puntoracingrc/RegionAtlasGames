import Link from "next/link";
import { formatCatalogEntryCount } from "@/lib/catalog-entry-count";

type CatalogGroupReference = {
  slug: string;
  name: string;
  catalogEntryCount: number;
  matchedCatalogEntryCount: number;
};

export function CompanyCatalogGroups({
  companyName,
  groups,
  kind,
}: {
  companyName: string;
  groups: CatalogGroupReference[];
  kind: "franchise" | "series";
}) {
  if (groups.length === 0) return null;
  const isFranchise = kind === "franchise";
  const singular = isFranchise ? "franquicia" : "saga";
  const plural = isFranchise ? "franquicias" : "sagas";
  const basePath = isFranchise ? "/franquicia" : "/saga";

  return (
    <section className="mb-10 border-y border-border py-5 md:py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {isFranchise ? "Franquicias relacionadas" : "Sagas relacionadas"}
          </h2>
          <p className="mt-1 text-sm text-foreground/75">
            {isFranchise ? "Franquicias" : "Sagas y subseries"} con al menos una ficha atribuida a {companyName}.
          </p>
        </div>
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          {groups.length} {groups.length === 1 ? singular : plural}
        </span>
      </div>

      <ul className="mt-4 divide-y divide-border border-y border-border">
        {groups.map((item) => (
          <li key={item.slug} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <Link href={`${basePath}/${item.slug}`} className="font-semibold text-foreground hover:text-accent">
              {item.name}
            </Link>
            <span className="text-sm text-muted">
              {formatCatalogEntryCount(item.matchedCatalogEntryCount)} de {companyName}
              {item.catalogEntryCount > 0
                ? ` · ${formatCatalogEntryCount(item.catalogEntryCount)} en ${isFranchise ? "la franquicia" : "la saga"}`
                : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
