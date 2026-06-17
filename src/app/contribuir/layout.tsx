import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { requireContributorUser } from "@/lib/admin-auth";

export default async function ContribuirLayout({ children }: { children: React.ReactNode }) {
  const user = await requireContributorUser();

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <header className="mb-5 overflow-hidden rounded-3xl border border-border/80 bg-card/80 p-5 shadow-sm shadow-black/5 backdrop-blur md:p-7 dark:shadow-black/20">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
                Panel colaborador
              </p>
              <h1 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">
                Contribuir al catálogo
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted md:text-base">
                Crea fichas nuevas, completa portada y datos, y envíalas a revisión del administrador.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-background/50 p-3 text-sm">
              <p className="text-[10px] uppercase tracking-wider text-muted">Sesión</p>
              <p className="mt-1 font-semibold text-foreground">{user.email}</p>
            </div>
          </div>
        </header>
        <nav className="sticky top-3 z-20 mb-8 flex flex-wrap gap-2 rounded-2xl border border-border/80 bg-nav/90 p-2 shadow-sm shadow-black/5 backdrop-blur dark:shadow-black/20">
          <Link
            href="/contribuir"
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:bg-card-hover hover:text-foreground"
          >
            ◇
            Mis envíos
          </Link>
          <Link
            href="/contribuir/nuevo"
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-accent-fg shadow-sm"
          >
            +
            Nueva ficha
          </Link>
        </nav>
        {children}
      </main>
    </>
  );
}
