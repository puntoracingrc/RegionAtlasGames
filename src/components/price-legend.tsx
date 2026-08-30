function SourceBadge({ code, label }: { code: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="rounded border border-border bg-card px-1 font-semibold text-foreground/80">
        {code}
      </span>
      {label}
    </span>
  );
}

export function PriceLegend({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const body = (
    <>
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

      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] font-medium text-muted hover:text-foreground">
          Cómo se forma la referencia
        </summary>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-border/50 pt-2">
          <SourceBadge code="P2P" label="Anuncios entre particulares verificados" />
          <SourceBadge code="ES" label="Tiendas españolas de segunda mano" />
          <SourceBadge code="IMP" label="Tiendas de importación especializadas" />
          <span className="inline-flex items-center gap-1.5">
            Cada fuente se pondera por fiabilidad, región y estado del artículo.
          </span>
        </div>
      </details>
    </>
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
