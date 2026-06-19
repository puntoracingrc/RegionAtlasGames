"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminFunctionCard, type AdminVisualTone } from "@/components/admin/admin-visual";

const STORAGE_KEY = "region-atlas-admin-quick-actions-order-v1";

export type AdminQuickAction = {
  href: string;
  title: string;
  description: string;
  icon: string;
  tone: AdminVisualTone;
};

function orderedActions(actions: AdminQuickAction[], savedOrder: string[]): AdminQuickAction[] {
  if (savedOrder.length === 0) return actions;
  const byHref = new Map(actions.map((action) => [action.href, action]));
  const ordered = savedOrder
    .map((href) => byHref.get(href))
    .filter((action): action is AdminQuickAction => Boolean(action));
  const known = new Set(ordered.map((action) => action.href));
  const missing = actions.filter((action) => !known.has(action.href));
  return [...ordered, ...missing];
}

function moveAction(actions: AdminQuickAction[], fromHref: string, toHref: string): AdminQuickAction[] {
  if (fromHref === toHref) return actions;
  const fromIndex = actions.findIndex((action) => action.href === fromHref);
  const toIndex = actions.findIndex((action) => action.href === toHref);
  if (fromIndex < 0 || toIndex < 0) return actions;

  const next = [...actions];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function moveActionByStep(actions: AdminQuickAction[], href: string, step: -1 | 1): AdminQuickAction[] {
  const fromIndex = actions.findIndex((action) => action.href === href);
  if (fromIndex < 0) return actions;
  const toIndex = fromIndex + step;
  if (toIndex < 0 || toIndex >= actions.length) return actions;

  const next = [...actions];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function AdminQuickActionsBoard({
  actions,
  hasPendingReview,
  pendingReviewCount,
}: {
  actions: AdminQuickAction[];
  hasPendingReview: boolean;
  pendingReviewCount: number;
}) {
  const [items, setItems] = useState(actions);
  const [draggingHref, setDraggingHref] = useState<string | null>(null);
  const [isEditingOrder, setIsEditingOrder] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const defaultOrder = useMemo(() => actions.map((action) => action.href), [actions]);

  const readSavedItems = useCallback(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return actions;
    try {
      const savedOrder = JSON.parse(raw);
      if (!Array.isArray(savedOrder)) return actions;
      return orderedActions(actions, savedOrder.filter((href): href is string => typeof href === "string"));
    } catch {
      return actions;
    }
  }, [actions]);

  useEffect(() => {
    setItems(readSavedItems());
    setHasChanges(false);
    setIsEditingOrder(false);
  }, [readSavedItems]);

  function saveOrder() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.map((item) => item.href)));
    setHasChanges(false);
    setIsEditingOrder(false);
  }

  function restoreOrder() {
    setItems(orderedActions(actions, defaultOrder));
    setHasChanges(true);
  }

  function moveWithButtons(href: string, step: -1 | 1) {
    setItems((current) => moveActionByStep(current, href, step));
    setHasChanges(true);
  }

  function renderCard(action: AdminQuickAction, index: number) {
    return (
      <AdminFunctionCard tone={action.tone} className="relative h-full transition group-hover:shadow-sm">
        {isEditingOrder ? (
          <div className="absolute right-3 top-3 flex items-center gap-1">
            <button
              type="button"
              className="rounded-lg border border-border bg-background/80 px-2 py-1 text-xs font-black text-muted transition hover:text-foreground disabled:opacity-35"
              disabled={index === 0}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                moveWithButtons(action.href, -1);
              }}
              title="Subir"
            >
              ↑
            </button>
            <button
              type="button"
              className="rounded-lg border border-border bg-background/80 px-2 py-1 text-xs font-black text-muted transition hover:text-foreground disabled:opacity-35"
              disabled={index === items.length - 1}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                moveWithButtons(action.href, 1);
              }}
              title="Bajar"
            >
              ↓
            </button>
            <span className="rounded-lg border border-border bg-background/70 px-2 py-1 text-xs font-black text-muted">
              ⋮⋮
            </span>
          </div>
        ) : null}
        {action.href === "/admin/cola" && hasPendingReview ? (
          <span
            aria-label={`${pendingReviewCount} fichas pendientes de revisión`}
            className="absolute right-3 top-3 h-3 w-3 rounded-full bg-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.16)]"
          />
        ) : null}
        <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-lg font-bold text-accent">
          {action.icon}
        </span>
        <p className="font-semibold text-foreground group-hover:text-accent">{action.title}</p>
        <p className="mt-1 text-xs leading-5 text-muted">{action.description}</p>
      </AdminFunctionCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {items.map((action, index) => {
          const isDragging = draggingHref === action.href;
          if (!isEditingOrder) {
            return (
              <Link key={action.href} href={action.href} className="group block h-full transition hover:-translate-y-0.5">
                {renderCard(action, index)}
              </Link>
            );
          }

          return (
            <div
              key={action.href}
              draggable
              onDragStart={(event) => {
                setDraggingHref(action.href);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", action.href);
              }}
              onDragEnd={() => setDraggingHref(null)}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const sourceHref = event.dataTransfer.getData("text/plain") || draggingHref;
                if (!sourceHref) return;
                setItems((current) => moveAction(current, sourceHref, action.href));
                setHasChanges(true);
                setDraggingHref(null);
              }}
              className={`group cursor-grab touch-none transition active:cursor-grabbing ${
                isDragging ? "scale-[0.98] opacity-50" : "hover:-translate-y-0.5"
              }`}
              title="Arrastra para reordenar"
            >
              {renderCard(action, index)}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background/45 p-3">
        <p className="text-xs leading-5 text-muted">
          {isEditingOrder
            ? "Arrastra los bloques o usa ↑/↓. Guarda el orden cuando lo tengas a tu gusto."
            : "Pulsa ordenar para mover los atajos. En modo normal las tarjetas abren su sección."}
        </p>
        <div className="flex flex-wrap gap-2">
          {isEditingOrder ? (
            <>
              <button type="button" className="btn-secondary text-xs" onClick={restoreOrder}>
                Restaurar orden
              </button>
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => {
                  setItems(readSavedItems());
                  setHasChanges(false);
                  setIsEditingOrder(false);
                  setDraggingHref(null);
                }}
              >
                Cancelar
              </button>
              <button type="button" className="btn-primary text-xs" disabled={!hasChanges} onClick={saveOrder}>
                {hasChanges ? "Guardar orden" : "Orden guardado"}
              </button>
            </>
          ) : (
            <button type="button" className="btn-primary text-xs" onClick={() => setIsEditingOrder(true)}>
              Ordenar atajos
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
