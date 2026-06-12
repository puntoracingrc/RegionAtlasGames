export function PriceLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="font-semibold text-accent">29 €</span>
        Precio ES verificado (P2P)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="font-semibold text-muted">Sin verificar</span>
        Orientativo; rango solo tras verificar región
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="font-semibold text-muted/80">Pendiente</span>
        Sin dato mercado ES
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="rounded border border-border bg-card px-1 font-semibold text-foreground/80">
          CeX
        </span>
        Retail (aparte del P2P)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="rounded border border-border bg-card px-1 font-semibold text-foreground/80">
          JGO
        </span>
        Import Barcelona
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="rounded border border-border bg-card px-1 font-semibold text-foreground/80">
          Chollo
        </span>
        Import Madrid
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="rounded border border-border bg-card px-1 font-semibold text-foreground/80">
          Kaoto
        </span>
        Shopify ES
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="font-semibold text-foreground/60">PC</span>
        Ref. EU PriceCharting
      </span>
    </div>
  );
}
