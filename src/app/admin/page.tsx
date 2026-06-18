import Link from "next/link";
import { Panel, PanelTitle } from "@/components/ui";
import { getCatalogStagingSummary } from "@/lib/catalog-staging";

const quickActions = [
  {
    href: "/admin/cola",
    title: "Revisar fichas",
    description: "Importaciones, manuales y envíos pendientes.",
    icon: "✓",
  },
  {
    href: "/admin/juegos/nuevo",
    title: "Crear juego",
    description: "Alta manual con comprobación de similares.",
    icon: "+",
  },
  {
    href: "/admin/importacion",
    title: "Importar catálogo",
    description: "CSV/Excel a revisión sin tocar colecciones.",
    icon: "⇪",
  },
  {
    href: "/admin/ia",
    title: "Completar con IA",
    description: "Rellena huecos por ficha o por lote seguro.",
    icon: "✦",
  },
  {
    href: "/admin/noticias",
    title: "Noticias",
    description: "Activa bloques y bloquea fuentes.",
    icon: "◫",
  },
  {
    href: "/admin/juegos",
    title: "Editar publicado",
    description: "Busca por título, slug o id de catálogo.",
    icon: "✎",
  },
  {
    href: "/admin/acciones",
    title: "Acciones masivas",
    description: "Agrupa juegos por filtros y aplica facetas o etiquetas.",
    icon: "☷",
  },
  {
    href: "/admin/entidades",
    title: "Entidades",
    description: "Plataformas, compañías y géneros.",
    icon: "▦",
  },
  {
    href: "/admin/entidades?tab=series",
    title: "Editar sagas",
    description: "Crear, buscar y agrupar juegos por saga.",
    icon: "♢",
  },
  {
    href: "/admin/taxonomia",
    title: "Géneros",
    description: "Agrupa géneros en principal, subgénero y etiqueta.",
    icon: "✣",
  },
  {
    href: "/admin/precios",
    title: "Historial precios",
    description: "Últimas recopilaciones, fuentes y siguiente plataforma.",
    icon: "€",
  },
];

export default async function AdminDashboardPage() {
  const summary = await getCatalogStagingSummary(8);

  return (
    <div className="space-y-6">
      <Panel>
        <PanelTitle eyebrow="Prioridad">Revisión de fichas</PanelTitle>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-5xl font-black tracking-tight text-foreground">
              {summary.totalGames}
            </p>
            <p className="mt-2 text-sm text-muted">
              juegos pendientes de revisión, enriquecimiento o publicación.
            </p>
          </div>
          <Link href="/admin/cola" className="btn-primary w-full sm:w-auto">
            Abrir revisión
          </Link>
        </div>
      </Panel>

      <Panel>
        <PanelTitle eyebrow="Atajos">Acciones rápidas</PanelTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group rounded-2xl border border-border bg-background/45 p-4 transition hover:-translate-y-0.5 hover:border-accent/40 hover:bg-card-hover"
            >
              <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-lg font-bold text-accent">
                {action.icon}
              </span>
              <p className="font-semibold text-foreground group-hover:text-accent">{action.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted">{action.description}</p>
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}
