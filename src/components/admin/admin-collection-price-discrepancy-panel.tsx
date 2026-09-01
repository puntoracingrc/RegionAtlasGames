import Link from "next/link";
import { COLLECTION_CONDITION_LABELS } from "@/lib/condition-prices";
import type { AdminCollectionPriceDiscrepancy } from "@/lib/admin-collection-price-discrepancies";
import { formatEur } from "@/lib/price-format";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import { adminToneClass } from "./admin-visual";

function reasonLabel(reason: AdminCollectionPriceDiscrepancy["reason"]): string {
  if (reason === "both") return "Catálogo y usuarios";
  return reason === "catalog" ? "Frente al catálogo" : "Entre usuarios";
}

export function AdminCollectionPriceDiscrepancyPanel({
  items,
}: {
  items: AdminCollectionPriceDiscrepancy[];
}) {
  return (
    <Panel className={adminToneClass(items.length > 0 ? "edit" : "status")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <PanelTitle eyebrow="Estimaciones de coleccionistas">Discrepancias de precio</PanelTitle>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Contrasta estimaciones anónimas de varios propietarios con el precio de catálogo para el mismo juego y estado.
          </p>
        </div>
        <Badge tone={items.length > 0 ? "amber" : "green"}>
          {items.length} {items.length === 1 ? "alerta" : "alertas"}
        </Badge>
      </div>

      {items.length === 0 ? (
        <p className="mt-4 border-l-2 border-emerald-500 pl-3 text-sm text-muted">
          No hay discrepancias fuertes con una muestra suficiente de usuarios.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="py-2 pr-4 font-semibold">Juego</th>
                <th className="py-2 pr-4 font-semibold">Estado</th>
                <th className="py-2 pr-4 font-semibold">Catálogo</th>
                <th className="py-2 pr-4 font-semibold">Mediana</th>
                <th className="py-2 pr-4 font-semibold">Rango usuarios</th>
                <th className="py-2 pr-4 font-semibold">Señal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={`${item.catalogId}:${item.condition}`} className="border-b border-border/60 last:border-0">
                  <td className="py-3 pr-4">
                    <Link href={`/admin/juegos/${encodeURIComponent(item.catalogId)}`} className="font-semibold text-foreground hover:text-accent">
                      {item.title}
                    </Link>
                    <p className="mt-1 text-xs uppercase text-muted">
                      {item.platformSlug} · {item.region} · {item.userCount} usuarios
                    </p>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap text-muted">
                    {COLLECTION_CONDITION_LABELS[item.condition]}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap font-semibold text-foreground">
                    {formatEur(item.catalogPrice)}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <span className="font-semibold text-foreground">{formatEur(item.userMedian)}</span>
                    {item.catalogDifferencePercent != null ? (
                      <span className="ml-2 text-xs text-amber-700 dark:text-amber-300">
                        {item.catalogDifferencePercent > 0 ? "+" : ""}{item.catalogDifferencePercent}%
                      </span>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap text-muted">
                    {formatEur(item.userMin)}–{formatEur(item.userMax)}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Badge tone="amber">{reasonLabel(item.reason)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
