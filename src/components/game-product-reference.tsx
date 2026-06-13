import type { CatalogGame, GameDetails } from "@/lib/types";
import { getGameProductReference } from "@/lib/game-product-reference";
import { Panel, PanelTitle } from "@/components/ui";
import { cn } from "@/lib/cn";

type Props = {
  game: CatalogGame;
  details?: GameDetails | null;
  /** panel = ficha completa · compact = cabecera colección · inline = fila en grid de detalles */
  variant?: "panel" | "compact" | "inline";
  className?: string;
};

export function GameProductReference({
  game,
  details,
  variant = "panel",
  className,
}: Props) {
  const info = getGameProductReference(game, details);
  if (!info) return null;

  const code = (
    <code className="rounded-md bg-black/30 px-2 py-1 font-mono text-sm text-foreground">
      {info.raw}
    </code>
  );

  const meta = (
    <p className="text-xs leading-relaxed text-muted">
      {info.regionHintNote}
      {info.regionHint && (
        <>
          {" "}
          · Sugiere región <span className="text-foreground/90">{info.regionHint}</span>
        </>
      )}
    </p>
  );

  if (variant === "compact") {
    return (
      <div className={cn("rounded-xl border border-border bg-card px-4 py-3", className)}>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{info.label}</p>
        <div className="mt-1.5">{code}</div>
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div className={className}>
        <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">{info.label}</dt>
        <dd className="mt-1 space-y-1">
          {code}
          {meta}
        </dd>
      </div>
    );
  }

  return (
    <Panel className={className}>
      <PanelTitle>{info.label}</PanelTitle>
      <div className="space-y-2">
        {code}
        {meta}
        <p className="text-[11px] text-muted">
          ID catálogo: <span className="font-mono text-foreground/80">{game.id}</span>
          {game.pcId != null && (
            <>
              {" "}
              · PriceCharting #{game.pcId}
            </>
          )}
        </p>
        <p className="text-[11px] text-muted">
          Búsqueda: puedes pegar este código en el buscador del catálogo (junto con título, compañía o
          género).
        </p>
      </div>
    </Panel>
  );
}
