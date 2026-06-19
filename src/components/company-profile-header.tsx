import Link from "next/link";
import Image from "next/image";
import { BackLink } from "@/components/breadcrumbs";
import {
  companyLifespanLabel,
  companyStatusLabel,
  type CompanyProfileView,
} from "@/lib/company-profile";
import { cn } from "@/lib/cn";

export function CompanyProfileHeader({ view }: { view: CompanyProfileView }) {
  const lifespan = companyLifespanLabel(view.foundedYear, view.closedYear);
  const relations = [
    view.parentCompany ? { label: "Pertenece a", company: view.parentCompany } : null,
    view.acquiredByCompany ? { label: "Comprada / absorbida por", company: view.acquiredByCompany } : null,
    view.successorCompany ? { label: "Se convirtió en", company: view.successorCompany } : null,
  ].filter(Boolean) as { label: string; company: { slug: string; name: string } }[];

  return (
    <header className="mt-4 mb-8 space-y-5">
      <BackLink href="/compania">Compañías</BackLink>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <CompanyLogo name={view.name} logoUrl={view.logoUrl} />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h1 className="text-4xl font-bold text-foreground">{view.name}</h1>
            <p className="mt-2 text-foreground/85">
              {view.gameCount.toLocaleString("es-ES")} juegos en el catálogo
              {view.developerCount > 0 && (
                <> · {view.developerCount.toLocaleString("es-ES")} como desarrolladora</>
              )}
              {view.publisherCount > 0 && (
                <> · {view.publisherCount.toLocaleString("es-ES")} como publicadora</>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            {view.developerCount > 0 && (
              <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-violet-900 dark:text-violet-100">
                Desarrolladora
              </span>
            )}
            {view.publisherCount > 0 && (
              <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-sky-900 dark:text-sky-100">
                Publicadora
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
            <div className="grid max-w-3xl gap-2 text-sm sm:grid-cols-2">
              {relations.map((relation) => (
                <Link
                  key={`${relation.label}:${relation.company.slug}`}
                  href={`/compania/${relation.company.slug}`}
                  className="rounded-2xl border border-border bg-card px-3 py-2 text-foreground/85 transition hover:border-accent/40 hover:text-accent"
                >
                  <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
                    {relation.label}
                  </span>
                  <span className="font-semibold">{relation.company.name}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function CompanyLogo({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  if (logoUrl) {
    return (
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-border bg-white p-2">
        <Image
          src={logoUrl}
          alt={`Logo de ${name}`}
          fill
          className="object-contain p-2"
          sizes="96px"
          unoptimized
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-border",
        "bg-gradient-to-br from-accent/20 to-card text-3xl font-bold text-accent",
      )}
      aria-hidden
    >
      {initial}
    </div>
  );
}
