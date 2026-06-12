import { formatEur } from "@/lib/catalog";
import { recordedSalesSummary } from "@/lib/recorded-sales";
import { Panel, PanelTitle } from "@/components/ui";

type Props = { catalogId: string };

export function RecordedProSalesPanel({ catalogId }: Props) {
  const { count, medianEur, latestAt } = recordedSalesSummary(catalogId);
  if (count === 0) return null;

  return (
    <Panel>
      <PanelTitle>Ventas Pro registradas (privado)</PanelTitle>
      <p className="text-sm text-muted">
        {count} venta{count !== 1 ? "s" : ""} cerrada{count !== 1 ? "s" : ""} entre usuarios Pro con
        doble confirmación. Datos anónimos — no sustituyen el precio P2P verificado hasta Fase 6.
      </p>
      <p className="mt-2 text-lg font-semibold text-foreground">
        Mediana Pro: {medianEur != null ? formatEur(medianEur) : "—"}
      </p>
      {latestAt && (
        <p className="mt-1 text-xs text-muted">
          Última:{" "}
          {new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(latestAt))}
        </p>
      )}
    </Panel>
  );
}
