import Link from "next/link";
import type { SeriesProfile } from "@/lib/series-profile";

function roleLabel(role: "developer" | "publisher" | "both"): string {
  if (role === "both") return "Desarrollo y edición";
  if (role === "developer") return "Desarrollo";
  return "Edición";
}

export function SeriesProfilePanel({ profile }: { profile: SeriesProfile }) {
  const yearRange =
    profile.firstYear && profile.latestYear && profile.firstYear !== profile.latestYear
      ? `${profile.firstYear}–${profile.latestYear}`
      : profile.firstYear
        ? String(profile.firstYear)
        : "Pendiente";

  return (
    <section className="mb-8 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
          Saga / franquicia
        </p>
        <h2 className="mt-2 text-2xl font-black text-foreground">
          Universo {profile.name}
        </h2>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-muted">
          {profile.description}
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-border bg-background/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Juegos</p>
            <p className="mt-1 text-2xl font-black text-foreground">
              {profile.gameCount.toLocaleString("es-ES")}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Periodo</p>
            <p className="mt-1 text-2xl font-black text-foreground">{yearRange}</p>
          </div>
          <div className="rounded-2xl border border-border bg-background/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Plataformas</p>
            <p className="mt-1 text-2xl font-black text-foreground">
              {profile.platformCount.toLocaleString("es-ES")}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Compañías</p>
            <p className="mt-1 text-2xl font-black text-foreground">
              {profile.companyCount.toLocaleString("es-ES")}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-black uppercase tracking-wider text-foreground">
            Plataformas en la saga
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {profile.platforms.slice(0, 12).map((platform) => (
              <Link
                key={platform.slug}
                href={`/plataforma/${platform.slug}`}
                className="rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-accent/50 hover:text-accent"
              >
                {platform.name} · {platform.count.toLocaleString("es-ES")}
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-black uppercase tracking-wider text-foreground">
            Compañías relacionadas
          </h3>
          <div className="mt-3 grid gap-2">
            {profile.companies.slice(0, 8).map((company) => (
              <Link
                key={company.slug}
                href={`/compania/${company.slug}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/60 px-3 py-2 text-sm transition hover:border-accent/50 hover:text-accent"
              >
                <span className="min-w-0 truncate font-semibold">{company.name}</span>
                <span className="shrink-0 text-xs text-muted">
                  {roleLabel(company.role)} · {company.gameCount.toLocaleString("es-ES")}
                </span>
              </Link>
            ))}
            {profile.companies.length === 0 && (
              <p className="text-sm text-muted">Aún no hay compañías enlazadas a esta saga.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
