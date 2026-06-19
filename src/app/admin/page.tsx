import Link from "next/link";
import { AdminFunctionCard } from "@/components/admin/admin-visual";
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
] as const;

export default async function AdminDashboardPage() {
  const summary = await getCatalogStagingSummary(8);
  const hasPendingReview = summary.totalGames > 0;

  return (
    <div className="space-y-6">
      <Panel className="border-sky-300/40 bg-sky-50/40 dark:border-sky-400/20 dark:bg-sky-950/10">
        <PanelTitle eyebrow="Atajos">Acciones rápidas</PanelTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group transition hover:-translate-y-0.5"
            >
              <AdminFunctionCard tone={action.tone} className="relative h-full transition group-hover:shadow-sm">
                {action.href === "/admin/cola" && hasPendingReview ? (
                  <span
                    aria-label={`${summary.totalGames} fichas pendientes de revisión`}
                    className="absolute right-4 top-4 h-3 w-3 rounded-full bg-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.16)]"
                  />
                ) : null}
                <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-lg font-bold text-accent">
                  {action.icon}
                </span>
                <p className="font-semibold text-foreground group-hover:text-accent">{action.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted">{action.description}</p>
              </AdminFunctionCard>
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}
