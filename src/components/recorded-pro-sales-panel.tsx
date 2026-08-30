import { formatEur } from "@/lib/price-format";
import { recordedSalesSummary } from "@/lib/recorded-sales";
import { Panel, PanelTitle } from "@/components/ui";

type Props = { catalogId: string };

export async function RecordedProSalesPanel({ catalogId }: Props) {
  const { count, medianEur, latestAt } = await recordedSalesSummary(catalogId);
  if (count === 0) return null;

  return (
    <Panel>
      <PanelTitle>Ventas registradas (privado)</PanelTitle>
      <p className="text-sm text-muted">
        {count} venta{count !== 1 ? "s" : ""} cerrada{count !== 1 ? "s" : ""} entre usuarios con
        doble confirmación. Son datos anónimos que complementan las estimaciones del catálogo.
      </p>
      <p className="mt-2 text-lg font-semibold text-foreground">
        Mediana registrada: {medianEur != null ? formatEur(medianEur) : "—"}
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
