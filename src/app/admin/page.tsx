import Link from "next/link";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import { getCatalogStagingSummary } from "@/lib/catalog-staging";
import { catalogOverlayEnabled } from "@/lib/catalog-runtime-overlay";

export default async function AdminDashboardPage() {
  const summary = await getCatalogStagingSummary(8);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Panel>
        <PanelTitle>Cola de importaciones</PanelTitle>
        <p className="text-3xl font-bold text-foreground">{summary.totalGames}</p>
        <p className="mt-1 text-sm text-muted">juegos pendientes de revisión o publicación</p>
        <Link href="/admin/cola" className="btn-primary mt-4 inline-block">
          Ver cola completa
        </Link>
      </Panel>

      <Panel>
        <PanelTitle>Acciones rápidas</PanelTitle>
        <ul className="space-y-2 text-sm">
          <li>
            <Link href="/admin/juegos/nuevo" className="text-accent hover:underline">
              Añadir juego manualmente
            </Link>
          </li>
          <li>
            <Link href="/admin/cola?status=pending" className="text-accent hover:underline">
              Pendientes de enriquecer
            </Link>
          </li>
        </ul>
        <p className="mt-4 text-xs text-muted">
          Publicación:{" "}
          {catalogOverlayEnabled() ? (
            <Badge tone="green">en caliente vía Blob</Badge>
          ) : (
            <Badge tone="amber">requiere Blob en Vercel</Badge>
          )}
        </p>
      </Panel>

      {summary.topByUnits.length > 0 && (
        <Panel className="md:col-span-2">
          <PanelTitle>Más solicitados por usuarios</PanelTitle>
          <ul className="divide-y divide-border">
            {summary.topByUnits.map((game) => (
              <li key={game.pcId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <Link
                    href={`/admin/cola/${game.pcId}`}
                    className="font-medium text-foreground hover:text-accent"
                  >
                    {game.title}
                  </Link>
                  <p className="text-xs text-muted">
                    {game.platformSlug} · {game.unitCount} uds · {game.userCount} usuarios
                  </p>
                </div>
                <Badge tone={game.status === "enriched" ? "green" : "amber"}>{game.status}</Badge>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
