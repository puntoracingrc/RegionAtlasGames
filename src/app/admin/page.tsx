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
    href: "/admin/juegos/nuevo",
    title: "Crear juego",
    description: "Alta manual con comprobación de similares.",
    icon: "+",
    tone: "edit",
  },
  {
    href: "/admin/importacion",
    title: "Importar catálogo",
    description: "CSV/Excel a revisión sin tocar colecciones.",
    icon: "⇪",
    tone: "bulk",
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
    href: "/admin/juegos",
    title: "Editar publicado",
    description: "Busca por título, slug o id de catálogo.",
    icon: "✎",
    tone: "edit",
  },
  {
    href: "/admin/acciones",
    title: "Acciones masivas",
    description: "Agrupa juegos por filtros y aplica facetas o etiquetas.",
    icon: "☷",
    tone: "bulk",
  },
  {
    href: "/admin/entidades",
    title: "Entidades",
    description: "Plataformas, compañías y géneros.",
    icon: "▦",
    tone: "search",
  },
  {
    href: "/admin/entidades?tab=series",
    title: "Editar sagas",
    description: "Crear, buscar y agrupar juegos por saga.",
    icon: "♢",
    tone: "edit",
  },
  {
    href: "/admin/taxonomia",
    title: "Géneros",
    description: "Agrupa géneros en principal, subgénero y etiqueta.",
    icon: "✣",
    tone: "search",
  },
  {
    href: "/admin/precios",
    title: "Historial precios",
    description: "Últimas recopilaciones, fuentes y siguiente plataforma.",
    icon: "€",
    tone: "status",
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
