import {
  AdminQuickActionsBoard,
  type AdminQuickAction,
} from "@/components/admin/admin-quick-actions-board";
import { AdminCopyDiagnosticButton } from "@/components/admin/admin-copy-diagnostic-button";
import { AdminNotice, AdminStatTile, adminToneClass } from "@/components/admin/admin-visual";
import { Panel, PanelTitle } from "@/components/ui";
import { adminHealthTone } from "@/lib/admin-operations-health";
import { getAdminOperationsOverview } from "@/lib/admin-operations-overview";

const quickActions = [
  {
    href: "/admin/cola",
    title: "Revisar fichas",
    description: "Importaciones, manuales y envíos pendientes.",
    icon: "✓",
    tone: "search",
  },
  {
    href: "/admin/gestion",
    title: "Gestión",
    description: "Crear, editar o eliminar juegos, sagas, entidades y taxonomías.",
    icon: "▦",
    tone: "edit",
  },
  {
    href: "/admin/higiene",
    title: "Higiene catálogo",
    description: "Escaneos técnicos del catálogo ejecutados por el PC.",
    icon: "⌁",
    tone: "status",
  },
  {
    href: "/admin/ia",
    title: "Completar con IA",
    description: "Rellena huecos por ficha o por lote seguro.",
    icon: "✦",
    tone: "ai",
  },
  {
    href: "/admin/noticias",
    title: "Noticias",
    description: "Activa bloques y bloquea fuentes.",
    icon: "◫",
    tone: "status",
  },
  {
    href: "/admin/precios",
    title: "Recolección",
    description: "Precios, fuentes, cobertura y siguiente plataforma.",
    icon: "€",
    tone: "status",
  },
  {
    href: "/admin/importacion",
    title: "Importar catálogo",
    description: "CSV/Excel a revisión sin tocar colecciones.",
    icon: "⇪",
    tone: "bulk",
  },
  {
    href: "/admin/sistema",
    title: "Sistema",
    description: "Almacenamiento, cron, recolectores y diagnóstico.",
    icon: "●",
    tone: "status",
  },
] satisfies AdminQuickAction[];

export default async function AdminDashboardPage() {
  const overview = await getAdminOperationsOverview();
  const actionSignals = overview.signals.filter((signal) => signal.level === "action" || signal.level === "watch");

  return (
    <div className="space-y-6">
      <Panel className={adminToneClass(adminHealthTone(overview.overall.level))}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <PanelTitle eyebrow="Control autónomo">Estado operativo</PanelTitle>
            <p className="max-w-3xl text-sm leading-6 text-muted">
              Resume las automatizaciones alojadas, la cola del PC y los procesos que necesitan atención.
            </p>
          </div>
          <AdminCopyDiagnosticButton diagnostic={overview.diagnostic} />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AdminStatTile
            label="Precios diarios"
            value={overview.workflows.dailyPrices.level === "ok" ? "Correcto" : overview.workflows.dailyPrices.level === "action" ? "Fallo" : "Revisar"}
            helper={overview.workflows.dailyPrices.detail}
            tone={adminHealthTone(overview.workflows.dailyPrices.level)}
          />
          <AdminStatTile
            label="Campaña eBay"
            value={overview.workflows.ebayCampaign.level === "ok" ? "Correcta" : overview.workflows.ebayCampaign.level === "action" ? "Fallo" : "Revisar"}
            helper={overview.workflows.ebayCampaign.detail}
            tone={adminHealthTone(overview.workflows.ebayCampaign.level)}
          />
          <AdminStatTile
            label="Fichas por enriquecer"
            value={overview.stats.pendingEnrichment ?? "—"}
            helper={overview.sections["/admin/ia"]?.detail}
            tone={adminHealthTone(overview.sections["/admin/ia"]?.level ?? "unknown")}
          />
          <AdminStatTile
            label="Cola del PC"
            value={`${overview.stats.runnerPending ?? "—"} espera · ${overview.stats.runnerRunning ?? "—"} activa`}
            helper={overview.signals.find((signal) => signal.label.startsWith("PC worker"))?.detail}
            tone={adminHealthTone(overview.signals.find((signal) => signal.label.startsWith("PC worker"))?.level ?? "unknown")}
          />
        </div>

        <div className="mt-4">
          <AdminNotice tone={adminHealthTone(overview.overall.level)}>
            <strong>{overview.overall.label}.</strong> {overview.overall.detail}
          </AdminNotice>
        </div>

        {actionSignals.length > 0 ? (
          <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-background/45 px-4">
            {actionSignals.map((signal) => (
              <div key={`${signal.label}-${signal.at ?? "none"}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{signal.label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted">{signal.detail}</p>
                </div>
                {signal.href ? (
                  <a href={signal.href} target="_blank" rel="noreferrer" className="btn-secondary shrink-0 text-xs">
                    Ver ejecución
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </Panel>

      <Panel className={adminToneClass("search")}>
        <PanelTitle eyebrow="Atajos">Acciones rápidas</PanelTitle>
        <AdminQuickActionsBoard
          actions={quickActions}
          statuses={overview.sections}
        />
      </Panel>
    </div>
  );
}
