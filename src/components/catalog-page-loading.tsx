export function CatalogPageLoading() {
  return (
    <main className="mx-auto min-h-[70vh] max-w-[1600px] px-4 py-8 md:px-6" aria-busy="true">
      <span className="fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden bg-accent/20" aria-hidden="true">
        <span className="navigation-progress-bar block h-full bg-accent" />
      </span>
      <p className="sr-only" role="status">Cargando catálogo…</p>

      <div className="h-6 w-36 animate-pulse rounded bg-card" />
      <div className="mt-6 h-36 animate-pulse rounded-xl border border-border bg-card" />
      <div className="mt-6 h-56 animate-pulse rounded-xl border border-border bg-card" />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 12 }, (_, index) => (
          <div key={index} className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="aspect-[3/4] animate-pulse bg-foreground/10" />
            <div className="space-y-2 p-3">
              <div className="h-4 w-4/5 animate-pulse rounded bg-foreground/10" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-foreground/10" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
