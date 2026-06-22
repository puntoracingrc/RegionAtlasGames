import {
  AdminQuickActionsBoard,
  type AdminQuickAction,
} from "@/components/admin/admin-quick-actions-board";
import { adminToneClass } from "@/components/admin/admin-visual";
import { Panel, PanelTitle } from "@/components/ui";
import { getCatalogStagingSummary } from "@/lib/catalog-staging";

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
] satisfies AdminQuickAction[];

export default async function AdminDashboardPage() {
  const summary = await getCatalogStagingSummary(8);
  const hasPendingReview = summary.totalGames > 0;

  return (
    <div className="space-y-6">
      <Panel className={adminToneClass("search")}>
        <PanelTitle eyebrow="Atajos">Acciones rápidas</PanelTitle>
        <AdminQuickActionsBoard
          actions={quickActions}
          hasPendingReview={hasPendingReview}
          pendingReviewCount={summary.totalGames}
        />
      </Panel>
    </div>
  );
}
