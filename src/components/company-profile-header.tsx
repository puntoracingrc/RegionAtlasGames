import Link from "next/link";
import { BackLink } from "@/components/breadcrumbs";
import { CompanyLogo } from "@/components/company-logo";
import { formatCatalogEntryCount } from "@/lib/catalog-entry-count";
import {
  companyLifespanLabel,
  companyStatusLabel,
  type CompanyProfileView,
} from "@/lib/company-profile";

export function CompanyProfileHeader({ view }: { view: CompanyProfileView }) {
  const lifespan = companyLifespanLabel(view.foundedYear, view.closedYear);
  type HeaderRelation = {
    label: string;
    company: { slug: string; name: string };
    evidenceUrl: string | null;
  };
  const legacyRelations = [
    view.parentCompany ? { label: "Pertenece a", company: view.parentCompany, evidenceUrl: null } : null,
    view.acquiredByCompany
      ? { label: "Comprada / absorbida por", company: view.acquiredByCompany, evidenceUrl: null }
      : null,
    view.mergedWithCompany
      ? { label: "Fusionada con", company: view.mergedWithCompany, evidenceUrl: null }
      : null,
    view.predecessorCompany
      ? { label: "Viene de", company: view.predecessorCompany, evidenceUrl: null }
      : null,
    view.successorCompany
      ? { label: "Se convirtió en", company: view.successorCompany, evidenceUrl: null }
      : null,
  ].filter(Boolean) as HeaderRelation[];
  const relationKeys = new Set<string>();
  const relations: HeaderRelation[] = [...legacyRelations, ...view.verifiedRelations].filter(
    (relation) => {
      const key = `${relation.label}:${relation.company.slug}`;
      if (relationKeys.has(key)) return false;
      relationKeys.add(key);
      return true;
    },
  );

  return (
    <header className="mt-4 mb-8 space-y-5">
      <BackLink href="/compania">Compañías</BackLink>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <CompanyLogo
          name={view.name}
          logoUrl={view.logoUrl}
          provisional={view.logoIsProvisional}
          size="lg"
          showProvisionalLabel
        />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h1 className="text-4xl font-bold text-foreground">{view.name}</h1>
            <p className="mt-2 text-foreground/85">
              {view.uniqueWorkCount.toLocaleString("es-ES")} {view.uniqueWorkCount === 1 ? "obra" : "obras"}
              {" · "}{formatCatalogEntryCount(view.catalogEntryCount)} catalogadas, incluidas sus ediciones
              {view.developerCatalogEntryCount > 0 && (
                <> · {formatCatalogEntryCount(view.developerCatalogEntryCount)} como desarrolladora</>
              )}
              {view.publisherCatalogEntryCount > 0 && (
                <> · {formatCatalogEntryCount(view.publisherCatalogEntryCount)} como publicadora</>
              )}
              {view.digitalPublisherCatalogEntryCount > 0 && (
                <> · {formatCatalogEntryCount(view.digitalPublisherCatalogEntryCount)} como editora digital</>
              )}
              {view.physicalPublisherCatalogEntryCount > 0 && (
                <> · {formatCatalogEntryCount(view.physicalPublisherCatalogEntryCount)} en edición o distribución física</>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            {view.developerCatalogEntryCount > 0 && (
              <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-violet-900 dark:text-violet-100">
                Desarrolladora
              </span>
            )}
            {view.publisherCatalogEntryCount > 0 && (
              <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-sky-900 dark:text-sky-100">
                Publicadora
              </span>
            )}
            {view.digitalPublisherCatalogEntryCount > 0 && (
              <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-emerald-900 dark:text-emerald-100">
                Editora digital
              </span>
            )}
            {view.physicalPublisherCatalogEntryCount > 0 && (
              <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-amber-900 dark:text-amber-100">
                Edición / distribución física
              </span>
            )}
            <span className="rounded-full border border-border bg-card px-3 py-1 text-foreground/85">
              {companyStatusLabel(view.status)}
            </span>
            {lifespan && (
              <span className="rounded-full border border-border bg-card px-3 py-1 text-foreground/85">
                {lifespan}
              </span>
            )}
            {view.profilePending && (
              <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-accent">
                Ficha editorial en preparación
              </span>
            )}
          </div>
          {view.alsoKnownAs.length > 0 && (
            <p className="max-w-3xl text-sm text-foreground/75">
              También indexada como {view.alsoKnownAs.slice(0, 5).join(" · ")}
              {view.alsoKnownAs.length > 5 ? " · …" : ""}
            </p>
          )}
          {relations.length > 0 && (
            <section className="max-w-4xl rounded-3xl border border-sky-400/25 bg-sky-500/10 p-4 shadow-sm">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.22em] text-sky-900 dark:text-sky-100">
                Relaciones corporativas
              </h2>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                {relations.map((relation) => (
                  <div
                    key={`${relation.label}:${relation.company.slug}`}
                    className="rounded-2xl border border-border bg-background/80 px-4 py-3 text-foreground/85 transition hover:border-accent/50 hover:bg-accent/10 hover:text-accent"
                  >
                    <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
                      {relation.label}
                    </span>
                    <Link
                      href={`/compania/${relation.company.slug}`}
                      className="font-semibold hover:underline"
                    >
                      {relation.company.name}
                    </Link>
                    {relation.evidenceUrl && (
                      <a
                        href={relation.evidenceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block text-xs text-muted hover:text-accent hover:underline"
                      >
                        Fuente verificada
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </header>
  );
}
