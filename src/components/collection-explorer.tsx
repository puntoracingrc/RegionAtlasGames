"use client";

import { useMemo, useState } from "react";
import { CheckSquare2, LayoutGrid, LoaderCircle, Lock, Rows3, Square, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { CollectionGameCard } from "@/components/game-card";
import { HighlightLegend } from "@/components/highlight-legend";
import { CollectionValueUpsell } from "@/components/collection-value-upsell";
import { CATALOG_GRID_CLASS } from "@/lib/cover-aspect";
import { formatEur } from "@/lib/price-format";
import {
  COLLECTION_SORT_OPTIONS,
  DEFAULT_COLLECTION_FILTERS,
  collectionDeveloperOptions,
  collectionPlatformOptions,
  collectionPublisherOptions,
  filterCollection,
  hasActiveCollectionFilters,
  sortCollectionDisplayItems,
} from "@/lib/collection-filters";
import type { CollectionSummary } from "@/lib/collection-store";
import type { CollectionListingState, CollectionView, GameFilters } from "@/lib/types";
import {
  collectionConditionValues,
  groupCollectionDisplayItems,
  type CollectionDisplayItem,
} from "@/lib/collection-display";
import { getCoverSrc } from "@/lib/cover-url";
import { decodeHtmlEntities } from "@/lib/decode-html-entities";
import { RegionFlag } from "@/components/region-flag";
import { IntentLink } from "@/components/intent-link";
import { collectionCatalogAnchorId, collectionCatalogPath } from "@/lib/collection-path";
import { LinkPendingFeedback } from "@/components/link-pending-feedback";
import {
  availableCollectionConditions,
  DEFAULT_COLLECTION_CONDITION,
  PRICED_COLLECTION_CONDITIONS,
  type PricedCollectionCondition,
} from "@/lib/collection-condition-policy";
import { COLLECTION_CONDITION_LABELS } from "@/lib/condition-prices";

type Props = {
  items: CollectionView[];
  summary: CollectionSummary;
  canViewCollectionValue: boolean;
  listingStateByItemId: Record<string, CollectionListingState>;
};

const selectClass =
  "rounded-xl border border-border bg-input px-4 py-2.5 text-sm text-foreground outline-none ring-accent/30 focus:ring-2";

const searchClass =
  "rounded-xl border border-border bg-input px-4 py-2.5 text-sm text-foreground outline-none ring-accent/30 placeholder:text-muted/90 focus:ring-2 xl:col-span-2";

type BulkFeedback = { kind: "success" | "error"; message: string } | null;

function displayItemKey(item: CollectionDisplayItem): string {
  return item.game.catalogId ?? item.game.id;
}

function blocksBulkConditionChange(state: CollectionListingState | undefined): boolean {
  return state === "active" || state === "pending-sale";
}

export function CollectionExplorer({
  items,
  summary,
  canViewCollectionValue,
  listingStateByItemId,
}: Props) {
  const router = useRouter();
  const [filters, setFilters] = useState<GameFilters>(DEFAULT_COLLECTION_FILTERS);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [bulkCondition, setBulkCondition] = useState<PricedCollectionCondition>(
    DEFAULT_COLLECTION_CONDITION,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [savingBulkCondition, setSavingBulkCondition] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState<BulkFeedback>(null);

  const groupedItems = useMemo(() => groupCollectionDisplayItems(items).map((item) => item.game), [items]);
  const platformOptions = useMemo(() => collectionPlatformOptions(groupedItems), [groupedItems]);
  const developerOptions = useMemo(() => collectionDeveloperOptions(groupedItems), [groupedItems]);
  const publisherOptions = useMemo(() => collectionPublisherOptions(groupedItems), [groupedItems]);

  const filtered = useMemo(
    () => filterCollection(items, filters, listingStateByItemId),
    [items, filters, listingStateByItemId],
  );
  const displayed = useMemo(
    () => sortCollectionDisplayItems(groupCollectionDisplayItems(filtered), filters.sort),
    [filtered, filters.sort],
  );
  const editableItemIdsByKey = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const item of displayed) {
      map.set(
        displayItemKey(item),
        item.itemIds.filter((itemId) => !blocksBulkConditionChange(listingStateByItemId[itemId])),
      );
    }
    return map;
  }, [displayed, listingStateByItemId]);
  const selectableDisplayed = useMemo(
    () => displayed.filter((item) => (editableItemIdsByKey.get(displayItemKey(item))?.length ?? 0) > 0),
    [displayed, editableItemIdsByKey],
  );
  const selectedDisplayed = useMemo(
    () => selectableDisplayed.filter((item) => selectedKeys.has(displayItemKey(item))),
    [selectableDisplayed, selectedKeys],
  );
  const selectedItemIds = useMemo(
    () => [
      ...new Set(
        selectedDisplayed.flatMap((item) => editableItemIdsByKey.get(displayItemKey(item)) ?? []),
      ),
    ],
    [editableItemIdsByKey, selectedDisplayed],
  );
  const selectedPlatforms = useMemo(
    () => [...new Set(selectedDisplayed.map((item) => item.game.platformSlug))],
    [selectedDisplayed],
  );
  const bulkConditionOptions = useMemo(
    () =>
      PRICED_COLLECTION_CONDITIONS.filter(
        (condition) =>
          selectedPlatforms.length === 0 ||
          selectedPlatforms.every((platform) =>
            availableCollectionConditions(platform).includes(condition),
          ),
      ),
    [selectedPlatforms],
  );
  const effectiveBulkCondition = bulkConditionOptions.includes(bulkCondition)
    ? bulkCondition
    : DEFAULT_COLLECTION_CONDITION;
  const selectedVisibleCount = selectedDisplayed.length;
  const allVisibleSelected =
    selectableDisplayed.length > 0 && selectedVisibleCount === selectableDisplayed.length;
  const blockedVisibleCopies = displayed.reduce(
    (total, item) =>
      total +
      item.itemIds.filter((itemId) => blocksBulkConditionChange(listingStateByItemId[itemId])).length,
    0,
  );
  const activeSaleKeys = useMemo(
    () =>
      new Set(
        items.flatMap((item) =>
          listingStateByItemId[item.id] === "active"
            ? [item.catalogMatched && item.catalogId ? item.catalogId : item.id]
            : [],
        ),
      ),
    [items, listingStateByItemId],
  );
  const displayedUnits = displayed.reduce((sum, item) => sum + item.units, 0);
  const filteredValue = filtered.reduce((sum, g) => sum + (g.totalValue || 0), 0);
  const filtersActive = hasActiveCollectionFilters(filters);

  function updateFilters(update: (current: GameFilters) => GameFilters) {
    setFilters(update);
    setSelectedKeys(new Set());
    setConfirmOpen(false);
    setBulkFeedback(null);
  }

  function toggleSelectionMode() {
    setSelectionMode((current) => {
      if (current) {
        setSelectedKeys(new Set());
        setConfirmOpen(false);
      }
      return !current;
    });
    setBulkFeedback(null);
  }

  function toggleDisplayedItem(item: CollectionDisplayItem) {
    const key = displayItemKey(item);
    if ((editableItemIdsByKey.get(key)?.length ?? 0) === 0) return;
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setBulkFeedback(null);
  }

  function toggleAllVisible() {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const item of selectableDisplayed) next.delete(displayItemKey(item));
      } else {
        for (const item of selectableDisplayed) next.add(displayItemKey(item));
      }
      return next;
    });
    setBulkFeedback(null);
  }

  async function applyBulkCondition() {
    if (selectedItemIds.length === 0) return;
    setSavingBulkCondition(true);
    setBulkFeedback(null);
    try {
      const response = await fetch("/api/user/collection/copies/bulk-condition", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemIds: selectedItemIds,
          collectionCondition: effectiveBulkCondition,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        updatedCount?: number;
        draftListingsSynced?: number;
      };
      if (!response.ok) throw new Error(payload.error || "No se pudo aplicar el cambio.");

      const updatedCount = Number(payload.updatedCount ?? 0);
      const drafts = Number(payload.draftListingsSynced ?? 0);
      setBulkFeedback({
        kind: "success",
        message:
          updatedCount === 0
            ? "Las copias seleccionadas ya tenían ese estado."
            : `${updatedCount} ${updatedCount === 1 ? "copia actualizada" : "copias actualizadas"}${
                drafts > 0 ? ` y ${drafts} borrador${drafts === 1 ? "" : "es"} sincronizado${drafts === 1 ? "" : "s"}` : ""
              }.`,
      });
      setConfirmOpen(false);
      setSelectionMode(false);
      setSelectedKeys(new Set());
      router.refresh();
    } catch (error) {
      setConfirmOpen(false);
      setBulkFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "No se pudo aplicar el cambio.",
      });
    } finally {
      setSavingBulkCondition(false);
    }
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">Catálogo enlazado</h2>
        <p className="text-sm text-muted">
          Juegos con ficha oficial en Region Atlas. El resto está en las secciones de pendientes y
          plataformas sin catálogo arriba.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ítems retro" value={String(summary.retroItems)} hint={`${summary.totalUnits} unidades`} />
        {canViewCollectionValue ? (
          <>
            <StatCard
              label="Valor venta"
              value={formatEur(summary.totalRecommendedValue)}
              hint={`${summary.withEsPrice} con precio actualizado`}
            />
            <StatCard label="Inversión compra" value={formatEur(summary.totalBuyValue)} hint="Base de coste" />
          </>
        ) : (
          <StatCard
            label="Valor venta"
            value="—"
            hint={`${summary.withEsPrice} con precio · inicia sesión para ver el total`}
            locked
          />
        )}
        <StatCard
          label="Fuera catálogo retro"
          value={String(summary.outOfScopeItems)}
          hint="PS5 y otras plataformas vivas"
          accent="rose"
        />
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            type="search"
            placeholder="Buscar título, plataforma, compañía…"
            value={filters.q}
            onChange={(e) => updateFilters((f) => ({ ...f, q: e.target.value }))}
            className={searchClass}
          />
          <select
            value={filters.platform}
            onChange={(e) => updateFilters((f) => ({ ...f, platform: e.target.value }))}
            className={`${selectClass} xl:col-span-2`}
            aria-label="Filtrar por plataforma"
          >
            <option value="all">Todas las plataformas ({groupedItems.length})</option>
            {platformOptions.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name} ({p.count})
              </option>
            ))}
          </select>
          {developerOptions.length > 0 && (
            <select
              value={filters.developer}
              onChange={(e) => updateFilters((f) => ({ ...f, developer: e.target.value }))}
              className={selectClass}
            >
              <option value="all">Todas las desarrolladoras</option>
              {developerOptions.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.name} ({d.count})
                </option>
              ))}
            </select>
          )}
          {publisherOptions.length > 0 && (
            <select
              value={filters.publisher}
              onChange={(e) => updateFilters((f) => ({ ...f, publisher: e.target.value }))}
              className={selectClass}
            >
              <option value="all">Todas las publicadoras</option>
              {publisherOptions.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name} ({p.count})
                </option>
              ))}
            </select>
          )}
          <select
            value={filters.sort}
            onChange={(e) =>
              updateFilters((f) => ({ ...f, sort: e.target.value as GameFilters["sort"] }))
            }
            className={selectClass}
            aria-label="Ordenar colección"
          >
            {COLLECTION_SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            value={filters.condition}
            onChange={(e) =>
              updateFilters((f) => ({
                ...f,
                condition: e.target.value as GameFilters["condition"],
              }))
            }
            className={selectClass}
            aria-label="Filtrar por estado"
          >
            <option value="all">Todos los estados</option>
            <option value="sealed">Precintado</option>
            <option value="complete">Abierto y completo</option>
            <option value="game-manual">Juego + manual</option>
            <option value="loose">Solo juego</option>
          </select>
          <select
            value={filters.sale}
            onChange={(e) =>
              updateFilters((f) => ({ ...f, sale: e.target.value as GameFilters["sale"] }))
            }
            className={selectClass}
            aria-label="Filtrar por estado de venta"
          >
            <option value="all">Todos los anuncios</option>
            <option value="active">A la venta</option>
            <option value="draft">Borrador de venta</option>
            <option value="pending-sale">Venta pendiente de confirmar</option>
            <option value="not-listed">No anunciado</option>
          </select>
          {filtersActive && (
            <button
              type="button"
              onClick={() => updateFilters(() => DEFAULT_COLLECTION_FILTERS)}
              className="rounded-xl border border-border bg-input px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-card-hover"
            >
              Limpiar filtros
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-foreground/85">
          <span>
            Mostrando <strong className="font-semibold text-foreground">{displayed.length}</strong>{" "}
            {displayed.length === 1 ? "juego" : "juegos"}
            {displayedUnits !== displayed.length ? ` · ${displayedUnits} unidades` : ""}
          </span>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={toggleSelectionMode}
              className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${
                selectionMode
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-border bg-input text-foreground hover:border-accent/40 hover:bg-card-hover"
              }`}
            >
              {selectionMode ? <X className="h-4 w-4" aria-hidden /> : <CheckSquare2 className="h-4 w-4" aria-hidden />}
              {selectionMode ? "Cancelar" : "Seleccionar"}
            </button>
            {canViewCollectionValue ? (
              <span>
                Valor filtrado:{" "}
                <strong className="font-semibold text-foreground">{formatEur(filteredValue)}</strong>
              </span>
            ) : (
              <CollectionValueUpsell compact />
            )}
            <div className="inline-flex rounded-lg border border-border bg-input p-0.5" aria-label="Vista de la colección">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                aria-label="Ver como cuadrícula"
                aria-pressed={viewMode === "grid"}
                title="Cuadrícula"
                className={`flex h-8 w-8 items-center justify-center rounded-md transition ${
                  viewMode === "grid" ? "bg-card-hover text-accent shadow-sm" : "text-muted hover:text-foreground"
                }`}
              >
                <LayoutGrid className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                aria-label="Ver como lista compacta"
                aria-pressed={viewMode === "list"}
                title="Lista compacta"
                className={`flex h-8 w-8 items-center justify-center rounded-md transition ${
                  viewMode === "list" ? "bg-card-hover text-accent shadow-sm" : "text-muted hover:text-foreground"
                }`}
              >
                <Rows3 className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        </div>
        {selectionMode && (
          <div className="mt-4 border-t border-border/70 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={toggleAllVisible}
                disabled={selectableDisplayed.length === 0}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-input px-3 text-sm font-semibold text-foreground transition hover:border-accent/40 hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-50"
                aria-pressed={allVisibleSelected}
              >
                {allVisibleSelected ? (
                  <CheckSquare2 className="h-4 w-4 text-accent" aria-hidden />
                ) : (
                  <Square className="h-4 w-4" aria-hidden />
                )}
                {allVisibleSelected ? "Quitar seleccion visible" : "Seleccionar todos los visibles"}
              </button>
              <span className="text-sm text-muted" aria-live="polite">
                <strong className="text-foreground">{selectedVisibleCount}</strong>{" "}
                {selectedVisibleCount === 1 ? "juego" : "juegos"} ·{" "}
                <strong className="text-foreground">{selectedItemIds.length}</strong>{" "}
                {selectedItemIds.length === 1 ? "copia editable" : "copias editables"}
              </span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(220px,1fr)_auto]">
              <select
                value={effectiveBulkCondition}
                onChange={(event) =>
                  setBulkCondition(event.target.value as PricedCollectionCondition)
                }
                disabled={selectedItemIds.length === 0}
                className={selectClass}
                aria-label="Nuevo estado para la selección"
              >
                {bulkConditionOptions.map((condition) => (
                  <option key={condition} value={condition}>
                    {COLLECTION_CONDITION_LABELS[condition]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={selectedItemIds.length === 0}
                className="btn-primary min-h-10 justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                Aplicar estado
              </button>
            </div>
            {blockedVisibleCopies > 0 && (
              <p className="mt-2 text-xs text-muted">
                {blockedVisibleCopies} {blockedVisibleCopies === 1 ? "copia visible queda" : "copias visibles quedan"}{" "}
                fuera por tener una venta activa o pendiente.
              </p>
            )}
          </div>
        )}
        {bulkFeedback && (
          <p
            className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
              bulkFeedback.kind === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                : "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-200"
            }`}
            role={bulkFeedback.kind === "error" ? "alert" : "status"}
          >
            {bulkFeedback.message}
          </p>
        )}
        <div className="mt-2 border-t border-border/60 pt-3">
          <HighlightLegend subdued={false} />
        </div>
      </section>

      {viewMode === "grid" ? (
        <section className={CATALOG_GRID_CLASS}>
          {displayed.map((item) => {
            const { game, conditionCounts } = item;
            const key = displayItemKey(item);
            const editableCopies = editableItemIdsByKey.get(key)?.length ?? 0;
            const blockedCopies = item.itemIds.length - editableCopies;
            return (
              <div
                key={key}
                id={collectionCatalogAnchorId(game.catalogId ?? game.id)}
                className="h-full scroll-mt-24"
              >
                <CollectionGameCard
                  game={game}
                  conditionCounts={conditionCounts}
                  conditionValues={collectionConditionValues(item)}
                  hasActiveListing={activeSaleKeys.has(
                    game.catalogMatched && game.catalogId ? game.catalogId : game.id,
                  )}
                  overlayAction={
                    selectionMode ? (
                      <BulkSelectionOverlay
                        title={decodeHtmlEntities(game.title)}
                        selected={selectedKeys.has(key)}
                        editableCopies={editableCopies}
                        blockedCopies={blockedCopies}
                        onToggle={() => toggleDisplayedItem(item)}
                      />
                    ) : undefined
                  }
                />
              </div>
            );
          })}
        </section>
      ) : (
        <section className="divide-y divide-border/70 border-y border-border/70">
          {displayed.map((item) => {
            const key = displayItemKey(item);
            const editableCopies = editableItemIdsByKey.get(key)?.length ?? 0;
            const blockedCopies = item.itemIds.length - editableCopies;
            return (
              <div key={key} className={`relative ${selectionMode ? "pl-10" : ""}`}>
                <CollectionCompactRow item={item} />
                {selectionMode && (
                  <BulkSelectionOverlay
                    compact
                    title={decodeHtmlEntities(item.game.title)}
                    selected={selectedKeys.has(key)}
                    editableCopies={editableCopies}
                    blockedCopies={blockedCopies}
                    onToggle={() => toggleDisplayedItem(item)}
                  />
                )}
              </div>
            );
          })}
        </section>
      )}

      {filtered.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          {items.length === 0
            ? "Aún no has importado ningún juego. Sube un Excel arriba para empezar."
            : "No hay juegos con estos filtros."}
        </p>
      )}

      <BulkConditionDialog
        open={confirmOpen}
        condition={effectiveBulkCondition}
        gameCount={selectedVisibleCount}
        copyCount={selectedItemIds.length}
        saving={savingBulkCondition}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={applyBulkCondition}
      />
    </div>
  );
}

function BulkSelectionOverlay({
  title,
  selected,
  editableCopies,
  blockedCopies,
  compact = false,
  onToggle,
}: {
  title: string;
  selected: boolean;
  editableCopies: number;
  blockedCopies: number;
  compact?: boolean;
  onToggle: () => void;
}) {
  const locked = editableCopies === 0;
  const label = locked
    ? `${title} no se puede seleccionar porque tiene una venta activa o pendiente`
    : `${selected ? "Quitar" : "Seleccionar"} ${title}: ${editableCopies} ${
        editableCopies === 1 ? "copia editable" : "copias editables"
      }`;

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={locked}
      aria-label={label}
      aria-pressed={locked ? undefined : selected}
      title={label}
      className={`absolute inset-0 z-20 transition ${
        compact ? "rounded-md" : "rounded-xl"
      } ${
        locked
          ? "cursor-not-allowed bg-foreground/[0.025]"
          : selected
            ? "bg-accent/[0.07] ring-2 ring-inset ring-accent"
            : "hover:bg-accent/[0.04] hover:ring-2 hover:ring-inset hover:ring-accent/40"
      }`}
    >
      <span
        className={`absolute flex h-8 w-8 items-center justify-center rounded-md border shadow-md ${
          compact ? "left-1 top-1/2 -translate-y-1/2" : "right-2 top-2"
        } ${
          locked
            ? "border-border bg-card text-muted"
            : selected
              ? "border-accent bg-accent text-white"
              : "border-border bg-card text-foreground"
        }`}
        aria-hidden
      >
        {locked ? (
          <Lock className="h-4 w-4" />
        ) : selected ? (
          <CheckSquare2 className="h-4 w-4" />
        ) : (
          <Square className="h-4 w-4" />
        )}
      </span>
      {blockedCopies > 0 && !compact && (
        <span className="absolute bottom-2 right-2 rounded-md border border-border bg-card/95 px-2 py-1 text-[10px] font-semibold text-muted shadow-sm">
          {locked
            ? "En venta"
            : `${blockedCopies} ${blockedCopies === 1 ? "copia fuera" : "copias fuera"}`}
        </span>
      )}
    </button>
  );
}

function BulkConditionDialog({
  open,
  condition,
  gameCount,
  copyCount,
  saving,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  condition: PricedCollectionCondition;
  gameCount: number;
  copyCount: number;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-condition-title"
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="bulk-condition-title" className="text-lg font-bold text-foreground">
              Confirmar cambio de estado
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              Vas a cambiar {copyCount} {copyCount === 1 ? "copia" : "copias"} de {gameCount}{" "}
              {gameCount === 1 ? "juego" : "juegos"} a{" "}
              <strong className="text-foreground">{COLLECTION_CONDITION_LABELS[condition]}</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted transition hover:bg-card-hover hover:text-foreground disabled:opacity-50"
            aria-label="Cerrar confirmación"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <p className="mt-3 rounded-lg border border-border bg-input px-3 py-2 text-xs leading-5 text-muted">
          Se recalculará el valor con el precio de ese estado. Las copias en venta o con una venta
          pendiente no se modifican.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="btn-secondary justify-center disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving || copyCount === 0}
            className="btn-primary justify-center disabled:cursor-wait disabled:opacity-60"
          >
            {saving ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                Aplicando…
              </>
            ) : (
              "Confirmar cambio"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function CollectionCompactRow({ item }: { item: CollectionDisplayItem }) {
  const { game } = item;
  const href = game.catalogId && game.catalogMatched
    ? collectionCatalogPath(game.catalogId)
    : `/coleccion/${game.id}`;
  const cover = getCoverSrc(game.coverUrl, game.catalogId ?? game.id);
  const conditionValues = collectionConditionValues(item);

  return (
    <IntentLink
      href={href}
      id={collectionCatalogAnchorId(game.catalogId ?? game.id)}
      className="group relative grid min-h-[76px] grid-cols-[42px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-1 py-2.5 transition [content-visibility:auto] hover:bg-card-hover sm:px-2 md:grid-cols-[46px_minmax(190px,0.8fr)_minmax(340px,1.4fr)]"
    >
      <div className="flex h-14 w-11 items-center justify-center overflow-hidden border border-border bg-card">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
        ) : (
          <span className="px-1 text-center text-[8px] uppercase text-muted">Sin portada</span>
        )}
      </div>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-foreground group-hover:text-accent">
          {decodeHtmlEntities(game.title)}
        </h3>
        <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted">
          <span className="uppercase">{game.platformSlug}</span>
          <span aria-hidden>·</span>
          <RegionFlag region={game.region} size="xs" showLabel labelMode="short" />
        </p>
      </div>
      <div className="col-span-2 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(96px,1fr))] divide-x divide-border/70 md:col-span-1">
        {conditionValues.map((value) => (
          <div
            key={value.condition}
            className="flex min-w-0 flex-col items-center justify-center px-2 py-1 text-center"
          >
            <span className="max-w-full truncate text-[10px] font-semibold uppercase text-muted">
              {value.label}
            </span>
            <strong className="mt-0.5 text-sm font-bold text-accent tabular-nums">
              {value.totalPrice == null
                ? "Pendiente"
                : `${formatEur(value.totalPrice)}${value.units > 1 ? " total" : ""}`}
            </strong>
            <span className="mt-0.5 text-[10px] text-muted tabular-nums">
              {value.units === 1
                ? "1 unidad"
                : value.unitPrice == null
                  ? `${value.units} unidades`
                  : `${value.units} uds. × ${formatEur(value.unitPrice)}`}
            </span>
          </div>
        ))}
      </div>
      <LinkPendingFeedback label="Abriendo ficha…" overlay />
    </IntentLink>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent = "amber",
  locked = false,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: "amber" | "rose";
  locked?: boolean;
}) {
  const color = locked ? "text-muted" : accent === "rose" ? "text-rose-700 dark:text-rose-300" : "text-accent";
  return (
    <article className="rounded-2xl border border-border bg-gradient-to-br from-white/[0.05] to-transparent p-5">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${color}`}>{value}</p>
      <p className="mt-1 text-sm text-muted">{hint}</p>
    </article>
  );
}
