import type { CatalogGame, GameDetails } from "@/lib/types";
import {
  buildGameRegionIdentity,
  regionSignalsAgree,
} from "@/lib/game-region-identity";
import { RegionFlag } from "@/components/region-flag";
import { Panel, PanelTitle } from "@/components/ui";

type Props = {
  game: CatalogGame;
  details?: GameDetails | null;
};

export function GameRegionIdentityPanel({ game, details }: Props) {
  const summary = buildGameRegionIdentity(game, details);
  const aligned = regionSignalsAgree(summary);

  return (
    <Panel>
      <PanelTitle>Identidad regional de esta edición</PanelTitle>
      <p className="text-sm text-muted">
        Esta ficha no es el juego genérico: es la edición{" "}
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          <RegionFlag region={game.region} size="sm" showLabel labelMode="short" />
          {summary.editionLabel}
        </span>
        . Los datos siguientes ayudan a distinguirla de otras regiones al comprar o comparar precios.
      </p>

      <dl className="mt-4 space-y-3">
        {summary.signals.map((signal) => (
          <div
            key={signal.id}
            className="rounded-lg border border-border/80 bg-background/30 px-3 py-2.5"
          >
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              {signal.label}
            </dt>
            <dd className="mt-1 text-sm font-medium text-foreground">{signal.value}</dd>
            {signal.suggests && signal.suggests !== summary.editionLabel && (
              <p className="mt-1 text-xs text-rose-300/90">
                Sugiere {signal.suggests} (la ficha es {summary.editionLabel})
              </p>
            )}
            {signal.hint && (
              <p className="mt-1 text-xs leading-relaxed text-muted">{signal.hint}</p>
            )}
          </div>
        ))}
      </dl>

      <div className="mt-4 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          Qué mirar en la copia física
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-foreground/90">
          {summary.physicalChecks.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      {!aligned && summary.referenceNote && (
        <p className="mt-3 text-xs text-muted">{summary.referenceNote}</p>
      )}

      <p className="mt-3 text-[11px] text-muted">
        Al comparar anuncios (Wallapop, eBay, Japan Game Online…) la región debe coincidir con esta
        edición. Un mismo título puede valer distinto en PAL, USA o Japón.
        {summary.signals.some((s) => s.id === "product-reference") && (
          <> La referencia producto también se usa para emparejar anuncios eBay, JGO, Chollo y Kaoto.</>
        )}
      </p>
    </Panel>
  );
}
