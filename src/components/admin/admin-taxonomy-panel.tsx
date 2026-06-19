"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminNotice, adminToneClass } from "@/components/admin/admin-visual";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import type { AdminTaxonomyLevel, AdminTaxonomyNode, AdminTaxonomyTreeNode } from "@/lib/admin-taxonomy";

type TaxonomyResponse = {
  ok: boolean;
  taxonomy: {
    updatedAt: string;
    nodes: Record<string, AdminTaxonomyNode>;
  };
  tree: AdminTaxonomyTreeNode[];
};

const levelLabels: Record<AdminTaxonomyLevel, string> = {
  main: "Género principal",
  subgenre: "Subgénero",
  tag: "Tipo / etiqueta",
};

const levelDescriptions: Record<AdminTaxonomyLevel, string> = {
  main: "La familia grande: Deportes, RPG, Aventura…",
  subgenre: "La rama concreta: fútbol, JRPG, survival horror…",
  tag: "La capa flexible: Full Motion Video (FMV), remaster, cooperativo…",
};

function flattenTree(tree: AdminTaxonomyTreeNode[]): AdminTaxonomyTreeNode[] {
  return tree.flatMap((node) => [node, ...flattenTree(node.children)]);
}

function sortNodes(nodes: AdminTaxonomyNode[]): AdminTaxonomyNode[] {
  return [...nodes].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es", { numeric: true }));
}

function parentOptions(nodes: AdminTaxonomyNode[], level: AdminTaxonomyLevel): AdminTaxonomyNode[] {
  if (level === "subgenre") return sortNodes(nodes.filter((node) => node.level === "main"));
  if (level === "tag") return sortNodes(nodes.filter((node) => node.level === "subgenre"));
  return [];
}

export function AdminTaxonomyPanel() {
  const [nodes, setNodes] = useState<Record<string, AdminTaxonomyNode>>({});
  const [tree, setTree] = useState<AdminTaxonomyTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [selectedMainSlug, setSelectedMainSlug] = useState<string | null>(null);
  const [selectedSubSlug, setSelectedSubSlug] = useState<string | null>(null);
  const [formLevel, setFormLevel] = useState<AdminTaxonomyLevel>("main");
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formParentSlug, setFormParentSlug] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const allNodes = useMemo(() => Object.values(nodes), [nodes]);
  const mainNodes = useMemo(() => sortNodes(allNodes.filter((node) => node.level === "main")), [allNodes]);
  const selectedMain = selectedMainSlug ? nodes[selectedMainSlug] : mainNodes[0];
  const subNodes = useMemo(
    () => sortNodes(allNodes.filter((node) => node.level === "subgenre" && node.parentSlug === selectedMain?.slug)),
    [allNodes, selectedMain?.slug],
  );
  const selectedSub = selectedSubSlug && nodes[selectedSubSlug]?.parentSlug === selectedMain?.slug
    ? nodes[selectedSubSlug]
    : subNodes[0];
  const tagNodes = useMemo(
    () => sortNodes(allNodes.filter((node) => node.level === "tag" && node.parentSlug === selectedSub?.slug)),
    [allNodes, selectedSub?.slug],
  );
  const flatTree = useMemo(() => flattenTree(tree), [tree]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/taxonomy");
      const data = (await res.json()) as TaxonomyResponse | { error?: string };
      if (!res.ok || !("taxonomy" in data)) {
        setError(("error" in data ? data.error : null) ?? "No se pudieron cargar los géneros.");
        return;
      }
      setNodes(data.taxonomy.nodes ?? {});
      setTree(data.tree ?? []);
      const firstMain = data.tree?.[0]?.slug ?? null;
      setSelectedMainSlug((current) => current ?? firstMain);
    } catch {
      setError("Error de red al cargar los géneros.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function resetForm(level: AdminTaxonomyLevel = formLevel) {
    setEditingSlug(null);
    setFormLevel(level);
    setFormName("");
    setFormSlug("");
    setFormParentSlug(level === "subgenre" ? selectedMain?.slug ?? "" : level === "tag" ? selectedSub?.slug ?? "" : "");
    setFormDescription("");
    setFormActive(true);
  }

  function startEdit(node: AdminTaxonomyNode) {
    setEditingSlug(node.slug);
    setFormLevel(node.level);
    setFormName(node.name);
    setFormSlug(node.slug);
    setFormParentSlug(node.parentSlug ?? "");
    setFormDescription(node.description);
    setFormActive(node.active);
    setError(null);
    setMessage(null);
  }

  async function saveNode(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        originalSlug: editingSlug ?? undefined,
        name: formName,
        slug: formSlug || undefined,
        level: formLevel,
        parentSlug: formLevel === "main" ? null : formParentSlug,
        description: formDescription,
        active: formActive,
      };
      const res = await fetch("/api/admin/taxonomy", {
        method: editingSlug ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo guardar.");
        return;
      }
      setMessage(`«${data.node.name}» guardado en géneros.`);
      resetForm(formLevel);
      await load();
    } catch {
      setError("Error de red al guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleNode(node: AdminTaxonomyNode) {
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/taxonomy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...node, originalSlug: node.slug, active: !node.active }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "No se pudo cambiar el estado.");
      return;
    }
    setMessage(`«${node.name}» ${!node.active ? "activado" : "desactivado"}.`);
    await load();
  }

  async function deleteNode(node: AdminTaxonomyNode) {
    if (!confirm(`¿Eliminar «${node.name}»? Primero deben estar borrados sus hijos.`)) return;
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/admin/taxonomy?slug=${encodeURIComponent(node.slug)}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "No se pudo eliminar.");
      return;
    }
    setMessage(`«${node.name}» eliminado.`);
    if (selectedMainSlug === node.slug) setSelectedMainSlug(null);
    if (selectedSubSlug === node.slug) setSelectedSubSlug(null);
    await load();
  }

  function NodeCard({
    node,
    selected,
    onSelect,
  }: {
    node: AdminTaxonomyNode;
    selected?: boolean;
    onSelect?: () => void;
  }) {
    return (
      <article
        className={`rounded-2xl border p-3 transition ${
          selected
            ? "border-accent/70 bg-accent/10 shadow-sm"
            : "border-border bg-background/45 hover:border-accent/30 hover:bg-card-hover"
        }`}
      >
        <button type="button" onClick={onSelect} className="block w-full text-left">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-foreground">{node.name}</p>
              <p className="mt-0.5 font-mono text-[11px] text-muted">{node.slug}</p>
            </div>
            <Badge tone={node.active ? "green" : "neutral"}>{node.active ? "ON" : "OFF"}</Badge>
          </div>
          {node.description ? <p className="mt-2 text-xs leading-5 text-muted">{node.description}</p> : null}
        </button>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => startEdit(node)}>
            Editar
          </button>
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => void toggleNode(node)}>
            {node.active ? "Desactivar" : "Activar"}
          </button>
          <button type="button" className="btn-danger px-3 py-1.5 text-xs" onClick={() => void deleteNode(node)}>
            Eliminar
          </button>
        </div>
      </article>
    );
  }

  const parentChoices = parentOptions(allNodes, formLevel);

  return (
    <div className="space-y-6">
      <Panel className={adminToneClass("search")}>
        <PanelTitle eyebrow="Géneros editoriales">Género principal · Subgénero · Tipo/etiqueta</PanelTitle>
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-sky-300/60 bg-sky-100/35 p-4 dark:border-sky-400/25 dark:bg-sky-950/15">
            <div className="rounded-2xl border border-sky-300/50 bg-card/60 p-3 dark:border-sky-400/20">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Accesos rápidos</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href="#crear-taxonomia" className="btn-secondary px-3 py-1.5 text-xs">
                  Crear / editar
                </a>
                <a href="#generos-principales" className="btn-secondary px-3 py-1.5 text-xs">
                  Géneros principales
                </a>
                <a href="#subgeneros" className="btn-secondary px-3 py-1.5 text-xs">
                  Subgéneros
                </a>
                <a href="#tipos-etiquetas" className="btn-secondary px-3 py-1.5 text-xs">
                  Tipos / etiquetas
                </a>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {(Object.keys(levelLabels) as AdminTaxonomyLevel[]).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => resetForm(level)}
                  className={`rounded-2xl border p-3 text-left transition ${
                    formLevel === level
                      ? "border-accent/70 bg-accent/10"
                      : "border-border bg-card/60 hover:bg-card-hover"
                  }`}
                >
                  <p className="text-sm font-semibold text-foreground">{levelLabels[level]}</p>
                  <p className="mt-1 text-xs leading-5 text-muted">{levelDescriptions[level]}</p>
                </button>
              ))}
            </div>
          </div>

          <form id="crear-taxonomia" onSubmit={saveNode} className="grid scroll-mt-24 gap-3 rounded-2xl border border-amber-300/60 bg-amber-100/35 p-4 dark:border-amber-400/25 dark:bg-amber-950/15">
            <div className="flex items-center justify-between gap-3">
              <PanelTitle eyebrow={editingSlug ? "Editar" : "Crear"}>
                {editingSlug ? "Elemento seleccionado" : levelLabels[formLevel]}
              </PanelTitle>
              {editingSlug ? (
                <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => resetForm(formLevel)}>
                  Cancelar
                </button>
              ) : null}
            </div>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Nombre</span>
              <input className="input" required value={formName} onChange={(e) => setFormName(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Slug</span>
              <input
                className="input font-mono text-xs"
                value={formSlug}
                onChange={(e) => setFormSlug(e.target.value)}
                placeholder="Opcional"
              />
            </label>
            {formLevel !== "main" ? (
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted">Padre</span>
                <select className="input" required value={formParentSlug} onChange={(e) => setFormParentSlug(e.target.value)}>
                  <option value="">Selecciona…</option>
                  {parentChoices.map((node) => (
                    <option key={node.slug} value={node.slug}>
                      {node.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Descripción interna</span>
              <textarea
                className="input min-h-24"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Criterio de uso, ejemplos, dudas…"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={formActive}
                onChange={(e) => setFormActive(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Activo
            </label>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Guardando…" : editingSlug ? "Guardar cambios" : "Crear elemento"}
            </button>
          </form>
        </div>
      </Panel>

      {error ? <AdminNotice tone="danger">{error}</AdminNotice> : null}
      {message ? <AdminNotice tone="status">{message}</AdminNotice> : null}

      <Panel className={adminToneClass("bulk")}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <PanelTitle eyebrow="Mapa actual">Árbol de clasificación</PanelTitle>
          <p className="text-xs text-muted">
            {flatTree.length} elementos · {mainNodes.length} géneros principales
          </p>
        </div>
        {loading ? (
          <p className="text-sm text-muted">Cargando géneros…</p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-3">
            <section id="generos-principales" className="scroll-mt-24 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Género principal</h3>
                <Badge>{mainNodes.length}</Badge>
              </div>
              {mainNodes.map((node) => (
                <NodeCard
                  key={node.slug}
                  node={node}
                  selected={selectedMain?.slug === node.slug}
                  onSelect={() => {
                    setSelectedMainSlug(node.slug);
                    setSelectedSubSlug(null);
                  }}
                />
              ))}
            </section>

            <section id="subgeneros" className="scroll-mt-24 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Subgéneros</h3>
                <Badge>{subNodes.length}</Badge>
              </div>
              {subNodes.length > 0 ? (
                subNodes.map((node) => (
                  <NodeCard
                    key={node.slug}
                    node={node}
                    selected={selectedSub?.slug === node.slug}
                    onSelect={() => setSelectedSubSlug(node.slug)}
                  />
                ))
              ) : (
                <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted">
                  Selecciona o crea subgéneros para {selectedMain?.name ?? "este género"}.
                </p>
              )}
            </section>

            <section id="tipos-etiquetas" className="scroll-mt-24 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Tipos / etiquetas</h3>
                <Badge>{tagNodes.length}</Badge>
              </div>
              {tagNodes.length > 0 ? (
                tagNodes.map((node) => <NodeCard key={node.slug} node={node} />)
              ) : (
                <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted">
                  Las etiquetas son opcionales: sirven para casos como Full Motion Video (FMV), remaster, cooperativo o edición especial.
                </p>
              )}
            </section>
          </div>
        )}
      </Panel>
    </div>
  );
}
