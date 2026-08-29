"use client";

import { useState } from "react";
import { AdminCatalogSearchPanel } from "@/components/admin/admin-catalog-search-panel";
import { AdminCatalogHygienePanel } from "@/components/admin/admin-catalog-hygiene-panel";
import { AdminContributorsPanel } from "@/components/admin/admin-contributors-panel";
import { AdminEntitiesPanel } from "@/components/admin/admin-entities-panel";
import type { CompanyOption } from "@/components/admin/admin-game-editor";
import { AdminNewGameForm } from "@/components/admin/admin-new-game-form";
import { AdminTaxonomyPanel } from "@/components/admin/admin-taxonomy-panel";
import { AdminNotice, adminToneClass } from "@/components/admin/admin-visual";
import { Panel, PanelTitle } from "@/components/ui";
import type { AdminGameEditorTaxonomyOption } from "@/lib/admin-game-editor-options";

type PlatformOption = { slug: string; name: string };

type EntityKey = "games" | "series" | "platforms" | "companies" | "taxonomy" | "contributors" | "hygiene";
type ActionKey = "create" | "edit" | "delete";

type Props = {
  platforms: PlatformOption[];
  regions: readonly string[];
  companies: CompanyOption[];
  taxonomyOptions: {
    genres: AdminGameEditorTaxonomyOption[];
    subgenres: AdminGameEditorTaxonomyOption[];
    facets: AdminGameEditorTaxonomyOption[];
  };
};

const entities: { id: EntityKey; label: string; helper: string }[] = [
  { id: "games", label: "Juegos", helper: "Fichas del catálogo." },
  { id: "series", label: "Sagas", helper: "Universos y agrupaciones." },
  { id: "platforms", label: "Plataformas", helper: "Consolas y familias." },
  { id: "companies", label: "Compañías", helper: "Desarrolladoras y editoras." },
  { id: "taxonomy", label: "Taxonomías", helper: "Géneros, subgéneros y facetas." },
  { id: "hygiene", label: "Higiene", helper: "Errores técnicos del catálogo." },
  { id: "contributors", label: "Colaboradores", helper: "Accesos del equipo." },
];

const actions: { id: ActionKey; label: string; helper: string }[] = [
  { id: "create", label: "Crear", helper: "Alta nueva." },
  { id: "edit", label: "Editar", helper: "Buscar y modificar." },
  { id: "delete", label: "Eliminar", helper: "Quitar con revisión." },
];

function optionClass(active: boolean): string {
  return `rounded-2xl border px-4 py-3 text-left transition-all ${
    active
      ? "border-accent bg-accent text-accent-fg shadow-sm"
      : "border-border bg-background/55 text-foreground hover:border-accent/40 hover:bg-card-hover"
  }`;
}

export function AdminManagementPanel({ platforms, regions, companies, taxonomyOptions }: Props) {
  const [entity, setEntity] = useState<EntityKey>("games");
  const [action, setAction] = useState<ActionKey>("edit");
  const actionApplies = entity === "games" || entity === "series" || entity === "platforms" || entity === "companies";

  function renderPanel() {
    if (entity === "games" && action === "create") {
      return (
        <AdminNewGameForm
          platforms={platforms}
          regions={regions}
          companies={companies}
          taxonomyOptions={taxonomyOptions}
          redirectBase="/admin/cola"
        />
      );
    }

    if (entity === "games" && action === "edit") {
      return <AdminCatalogSearchPanel />;
    }

    if (entity === "games" && action === "delete") {
      return (
        <div className="space-y-4">
          <AdminNotice tone="status">
            Busca la ficha y ábrela. El editor muestra la eliminación definitiva con su confirmación de seguridad.
          </AdminNotice>
          <AdminCatalogSearchPanel />
        </div>
      );
    }

    if (entity === "series") {
      return <AdminEntitiesPanel initialTab="series" mode={action} lockTab />;
    }

    if (entity === "platforms") {
      return <AdminEntitiesPanel initialTab="platforms" mode={action} lockTab />;
    }

    if (entity === "companies") {
      return <AdminEntitiesPanel initialTab="companies" mode={action} lockTab />;
    }

    if (entity === "taxonomy") {
      return <AdminTaxonomyPanel />;
    }

    if (entity === "contributors") {
      return <AdminContributorsPanel />;
    }

    if (entity === "hygiene") {
      return <AdminCatalogHygienePanel />;
    }

    return null;
  }

  return (
    <div className="space-y-6">
      <Panel className={adminToneClass("search")}>
        <PanelTitle eyebrow="Gestión">Crear, editar y eliminar</PanelTitle>
        <p className="mb-5 max-w-4xl text-sm leading-6 text-muted">
          Elige primero sobre qué parte del admin quieres trabajar y después la acción. Debajo se abre el panel
          correspondiente con sus buscadores, filtros y opciones actuales.
        </p>

        <div className="space-y-5">
          <section className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted">1. Selecciona sección</p>
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
              {entities.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={optionClass(entity === item.id)}
                  onClick={() => {
                    setEntity(item.id);
                    if (item.id === "taxonomy" || item.id === "hygiene" || item.id === "contributors") {
                      setAction("edit");
                    }
                  }}
                >
                  <span className="block text-sm font-black">{item.label}</span>
                  <span className={`mt-1 block text-xs leading-5 ${entity === item.id ? "text-accent-fg/80" : "text-muted"}`}>
                    {item.helper}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {actionApplies ? (
            <section className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted">2. Selecciona acción</p>
              <div className="grid gap-3 md:grid-cols-3">
                {actions.map((item) => {
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={optionClass(action === item.id)}
                      onClick={() => setAction(item.id)}
                    >
                      <span className="block text-sm font-black">{item.label}</span>
                      <span className={`mt-1 block text-xs leading-5 ${action === item.id ? "text-accent-fg/80" : "text-muted"}`}>
                        {item.helper}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : (
            <p className="text-xs leading-5 text-muted">Esta sección tiene una única herramienta y se abre directamente.</p>
          )}
        </div>
      </Panel>

      {renderPanel()}
    </div>
  );
}
