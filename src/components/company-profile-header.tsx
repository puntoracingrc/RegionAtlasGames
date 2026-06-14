import Link from "next/link";
import Image from "next/image";
import { BackLink } from "@/components/breadcrumbs";
import { companyEntityWikidataUrl } from "@/lib/company-canonical";
import {
  companyLifespanLabel,
  companyStatusLabel,
  type CompanyProfileView,
} from "@/lib/company-profile";
import { cn } from "@/lib/cn";

export function CompanyProfileHeader({ view }: { view: CompanyProfileView }) {
  const lifespan = companyLifespanLabel(view.foundedYear, view.closedYear);

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
          {view.wikidataId && (
            <p className="text-sm">
              <Link
                href={companyEntityWikidataUrl(view.wikidataId)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                Wikidata ({view.wikidataId})
              </Link>
            </p>
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
