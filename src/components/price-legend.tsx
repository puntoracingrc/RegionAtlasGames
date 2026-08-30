export function PriceLegend({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const body = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="inline-flex items-center gap-2">
        <span className="rounded-md bg-accent/15 px-1.5 py-0.5 font-semibold text-accent">29 €</span>
        <span>Precio verificado</span>
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="rounded-md bg-muted/20 px-1.5 py-0.5 font-semibold text-muted">—</span>
        <span>Sin verificar / orientativo</span>
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="rounded-md border border-dashed border-border px-1.5 py-0.5 font-semibold text-muted/80">
          ···
        </span>
        <span>Sin dato de mercado</span>
      </span>
    </div>
  );

  if (defaultOpen) {
    return (
      <div className="rounded-lg border border-border/70 bg-muted/5 px-3 py-2.5 text-xs text-muted">
        {body}
      </div>
    );
  }

  return (
    <details className="rounded-lg border border-border/70 bg-muted/5 text-xs text-muted">
      <summary className="cursor-pointer px-3 py-2 font-medium text-muted hover:text-foreground">
        ¿Cómo leer los precios?
      </summary>
      <div className="border-t border-border/50 px-3 py-2.5">{body}</div>
    </details>
  );
}
