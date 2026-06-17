import { Suspense } from "react";
import { SiteNav } from "@/components/site-nav";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdminUser } from "@/lib/admin-auth";
import { Badge } from "@/components/ui";
import { catalogOverlayEnabled } from "@/lib/catalog-runtime-overlay";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminUser();
  const hotPublishEnabled = catalogOverlayEnabled();

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <header className="mb-5 overflow-hidden rounded-3xl border border-border/80 bg-card/80 p-5 shadow-sm shadow-black/5 backdrop-blur md:p-7 dark:shadow-black/20">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
                Centro de mando
              </p>
              <h1 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">
                Admin de Region Atlas
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted md:text-base">
                Revisa fichas, publica juegos en caliente, ajusta precios y gestiona entidades sin
                salir del panel.
              </p>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-2 lg:min-w-[360px]">
              <div className="rounded-2xl border border-border bg-background/50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted">Publicación</p>
                <div className="mt-1">
                  {hotPublishEnabled ? (
                    <Badge tone="green">Blob activo</Badge>
                  ) : (
                    <Badge tone="amber">pendiente Blob</Badge>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-background/50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted">Modo recomendado</p>
                <p className="mt-1 font-semibold text-foreground">Probar local → desplegar</p>
              </div>
            </div>
          </div>
        </header>
        <Suspense fallback={null}>
          <AdminNav />
        </Suspense>
        {children}
      </main>
    </>
  );
}
