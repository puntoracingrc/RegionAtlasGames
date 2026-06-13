function RetailBadge({ code, label }: { code: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="rounded border border-border bg-card px-1 font-semibold text-foreground/80">
        {code}
      </span>
      {label}
    </span>
  );
}

export function PriceLegend() {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/5 px-3 py-2.5 text-xs text-muted">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5">
          <span className="font-semibold text-accent">29 €</span>
          Precio ES verificado (mediana P2P)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="font-semibold text-muted">Sin verificar</span>
          Orientativo; rango solo tras verificar región
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="font-semibold text-muted/80">Pendiente</span>
          Sin dato mercado ES
        </span>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] font-medium text-foreground/55 hover:text-foreground/75">
          Fuentes y abreviaturas de tiendas
        </summary>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-border/50 pt-2">
          <RetailBadge code="P2P" label="eBay ES · TodoColeccion (Wallapop/Vinted en roadmap)" />
          <RetailBadge code="CeX" label="Retail (aparte)" />
          <RetailBadge code="JGO" label="Import Barcelona" />
          <RetailBadge code="Chollo" label="Import Madrid" />
          <RetailBadge code="Kaoto" label="Shopify ES" />
          <RetailBadge code="TC" label="TodoColeccion (lote activo ES)" />
          <RetailBadge code="TCNS" label="TodoConsolas (2ª mano ES)" />
          <span className="inline-flex items-center gap-1.5">
            <span className="font-semibold text-foreground/60">PC</span>
            Ref. EU PriceCharting
          </span>
        </div>
      </details>
    </div>
  );
}
