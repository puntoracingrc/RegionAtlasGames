"use client";

import Link from "next/link";
import {
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Edit3,
  ExternalLink,
  Gauge,
  Handshake,
  Inbox,
  MapPin,
  MessageCircle,
  PackagePlus,
  Plus,
  RotateCcw,
  Save,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  Store,
  Trash2,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { RegionFlag } from "@/components/region-flag";
import { cn } from "@/lib/cn";
import { formatEurCents } from "@/lib/price-format";
import type { CollectionCondition } from "@/lib/types";
import {
  DEFAULT_SIMULATION_FILTERS,
  SIMULATION_CONDITION_LABELS,
  addSimulationMessage,
  blockSimulationConversation,
  confirmSimulationReceipt,
  createSimulationListing,
  createVitrinaSimulationState,
  filterSimulationListings,
  isVitrinaSimulationState,
  markSimulationNotificationsRead,
  markSimulationSale,
  normalizeSimulationSearch,
  publishSimulationListing,
  removeSimulationListing,
  simulationCoverage,
  simulationListingDistanceKm,
  startSimulationConversation,
  updateSimulationListing,
  type SimulationCatalogGame,
  type SimulationConversation,
  type SimulationListing,
  type SimulationListingFilters,
  type SimulationNotification,
  type SimulationUser,
  type VitrinaSimulationState,
} from "@/lib/vitrina-simulation";

type Props = {
  catalogGames: SimulationCatalogGame[];
};

type SimulationView = "market" | "mine" | "messages" | "notifications";

const STORAGE_KEY = "region-atlas:vitrina-simulation:v1";
const PERSONA_KEY = "region-atlas:vitrina-simulation:persona";
const PAGE_SIZE = 60;

const VIEW_OPTIONS: Array<{
  value: SimulationView;
  label: string;
  icon: typeof Store;
}> = [
  { value: "market", label: "Mercado", icon: Store },
  { value: "mine", label: "Mis anuncios", icon: ShoppingBag },
  { value: "messages", label: "Mensajes", icon: MessageCircle },
  { value: "notifications", label: "Notificaciones", icon: Bell },
];

function parseStoredState(raw: string | null): VitrinaSimulationState | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isVitrinaSimulationState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function formatWhen(iso: string | null): string {
  if (!iso) return "Sin publicar";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Fecha no indicada";
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function distanceLabel(distance: number | null): string | null {
  if (distance == null) return null;
  if (distance < 10) return "~" + distance.toFixed(1) + " km";
  return "~" + Math.round(distance) + " km";
}

function statusLabel(status: SimulationListing["status"]): string {
  if (status === "active") return "Publicado";
  if (status === "draft") return "Borrador";
  if (status === "sold") return "Vendido";
  return "Retirado";
}

function statusTone(status: SimulationListing["status"]): string {
  if (status === "active") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (status === "draft") return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
  if (status === "sold") return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
  return "bg-card-hover text-muted";
}

function notificationIcon(kind: SimulationNotification["kind"]) {
  if (kind === "new_message") return MessageCircle;
  if (kind === "sale_marked" || kind === "sale_completed") return Handshake;
  if (kind === "listing_created") return PackagePlus;
  return Edit3;
}

function uniqueOptions(values: Array<{ value: string; label: string }>) {
  return [...new Map(values.map((option) => [option.value, option])).values()]
    .sort((left, right) => left.label.localeCompare(right.label, "es"));
}

function inputPrice(value: number | null): string {
  return value == null ? "" : String(value);
}

function parsePrice(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function VitrinaSimulationLab({ catalogGames }: Props) {
  const [state, setState] = useState<VitrinaSimulationState>(() =>
    createVitrinaSimulationState(catalogGames),
  );
  const stateRef = useRef(state);
  const [hydrated, setHydrated] = useState(false);
  const [storedBytes, setStoredBytes] = useState(0);
  const [filterElapsedMs, setFilterElapsedMs] = useState(0);
  const [personaId, setPersonaIdState] = useState(state.users[0].id);
  const [view, setViewState] = useState<SimulationView>("market");
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [editorListingId, setEditorListingId] = useState<"new" | string | null>(null);
  const [filters, setFilters] = useState<SimulationListingFilters>({
    ...DEFAULT_SIMULATION_FILTERS,
  });
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const marketTopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const stored = parseStoredState(raw);
    if (stored) {
      stateRef.current = stored;
    }

    const params = new URLSearchParams(window.location.search);
    const queryPersona = params.get("usuario");
    const sessionPersona = window.sessionStorage.getItem(PERSONA_KEY);
    const candidatePersona = queryPersona || sessionPersona;
    const sourceState = stored ?? stateRef.current;
    const validPersona = candidatePersona
      && sourceState.users.some((user) => user.id === candidatePersona)
      ? candidatePersona
      : null;
    if (validPersona) {
      window.sessionStorage.setItem(PERSONA_KEY, validPersona);
    }

    const queryView = params.get("vista");
    const validView = VIEW_OPTIONS.some((option) => option.value === queryView)
      ? queryView as SimulationView
      : null;
    const queryConversation = params.get("conversacion");
    const hydrationTimer = window.setTimeout(() => {
      if (stored) {
        setState(stored);
        setStoredBytes(new Blob([raw ?? ""]).size);
      }
      if (validPersona) setPersonaIdState(validPersona);
      if (validView) setViewState(validView);
      if (queryConversation) setSelectedConversationId(queryConversation);
      setHydrated(true);
    }, 0);

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next = parseStoredState(event.newValue);
      if (!next || next.revision < stateRef.current.revision) return;
      stateRef.current = next;
      setState(next);
      setStoredBytes(new Blob([event.newValue ?? ""]).size);
      setToast("Cambios recibidos desde otra pestaña.");
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.clearTimeout(hydrationTimer);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3_000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    document.body.style.overflow = selectedListingId || editorListingId ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [editorListingId, selectedListingId]);

  function readLatestState(): VitrinaSimulationState {
    const stored = parseStoredState(window.localStorage.getItem(STORAGE_KEY));
    return stored && stored.revision >= stateRef.current.revision ? stored : stateRef.current;
  }

  function commit<T extends { state: VitrinaSimulationState }>(
    operation: (current: VitrinaSimulationState) => T,
  ): T {
    const current = readLatestState();
    const result = operation(current);
    if (result.state !== current) {
      stateRef.current = result.state;
      setState(result.state);
      try {
        const serialized = JSON.stringify(result.state);
        window.localStorage.setItem(STORAGE_KEY, serialized);
        setStoredBytes(new Blob([serialized]).size);
      } catch {
        setToast("El navegador no ha podido guardar más datos de simulación.");
      }
    }
    return result;
  }

  function updateUrl(nextPersona: string, nextView: SimulationView, conversationId?: string | null) {
    const params = new URLSearchParams(window.location.search);
    params.set("usuario", nextPersona);
    params.set("vista", nextView);
    if (conversationId) params.set("conversacion", conversationId);
    else params.delete("conversacion");
    window.history.replaceState(null, "", "/laboratorio/vitrina?" + params.toString());
  }

  function setPersonaId(nextPersona: string) {
    if (!state.users.some((user) => user.id === nextPersona)) return;
    setPersonaIdState(nextPersona);
    window.sessionStorage.setItem(PERSONA_KEY, nextPersona);
    setSelectedConversationId(null);
    setSelectedListingId(null);
    updateUrl(nextPersona, view);
  }

  function setView(nextView: SimulationView, conversationId?: string | null) {
    setViewState(nextView);
    if (conversationId !== undefined) setSelectedConversationId(conversationId);
    updateUrl(personaId, nextView, conversationId ?? selectedConversationId);
  }

  function resetSimulation() {
    if (!window.confirm("¿Restablecer todos los anuncios, chats y pruebas de este navegador?")) return;
    const fresh = createVitrinaSimulationState(catalogGames);
    stateRef.current = fresh;
    setState(fresh);
    window.localStorage.removeItem(STORAGE_KEY);
    setStoredBytes(0);
    setFilters({ ...DEFAULT_SIMULATION_FILTERS });
    setPage(1);
    setSelectedListingId(null);
    setSelectedConversationId(null);
    setEditorListingId(null);
    setToast("Simulación restablecida.");
  }

  const currentUser = state.users.find((user) => user.id === personaId) ?? state.users[0];
  const deferredQuery = useDeferredValue(filters.query);
  const effectiveFilters = useMemo(
    () => ({ ...filters, query: deferredQuery }),
    [deferredQuery, filters],
  );
  const filteredListings = useMemo(
    () => filterSimulationListings(
      state.listings,
      effectiveFilters,
      currentUser.location,
    ),
    [currentUser.location, effectiveFilters, state.listings],
  );
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const startedAt = performance.now();
      filterSimulationListings(state.listings, effectiveFilters, currentUser.location);
      setFilterElapsedMs(performance.now() - startedAt);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentUser.location, effectiveFilters, state.listings]);
  const totalPages = Math.max(1, Math.ceil(filteredListings.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleListings = filteredListings.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const selectedListing = selectedListingId
    ? state.listings.find((listing) => listing.id === selectedListingId) ?? null
    : null;
  const coverage = useMemo(() => simulationCoverage(state.listings), [state.listings]);
  const userConversations = useMemo(
    () => state.conversations
      .filter((conversation) =>
        conversation.buyerId === currentUser.id || conversation.sellerId === currentUser.id,
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [currentUser.id, state.conversations],
  );
  const selectedConversation = userConversations.find(
    (conversation) => conversation.id === selectedConversationId,
  ) ?? userConversations[0] ?? null;
  const userNotifications = useMemo(
    () => state.notifications
      .filter((item) => item.recipientId === currentUser.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [currentUser.id, state.notifications],
  );
  const unreadNotifications = userNotifications.filter((item) => !item.readAt).length;
  const ownOpenListings = state.listings.filter(
    (listing) =>
      listing.sellerId === currentUser.id
      && (listing.status === "active" || listing.status === "draft"),
  ).length;

  function contactListing(listing: SimulationListing) {
    if (listing.sellerId === currentUser.id) {
      setEditorListingId(listing.id);
      setSelectedListingId(null);
      return;
    }
    const result = commit((current) =>
      startSimulationConversation(current, listing.id, currentUser.id),
    );
    if (result.error || !result.conversationId) {
      setToast(result.error ?? "No se pudo abrir el chat.");
      return;
    }
    setSelectedListingId(null);
    setSelectedConversationId(result.conversationId);
    setView("messages", result.conversationId);
  }

  function openConversation(conversationId: string) {
    const unreadIds = stateRef.current.notifications
      .filter((item) =>
        item.recipientId === currentUser.id
        && item.conversationId === conversationId
        && !item.readAt,
      )
      .map((item) => item.id);
    if (unreadIds.length > 0) {
      commit((current) => ({
        state: markSimulationNotificationsRead(current, currentUser.id, unreadIds),
      }));
    }
    setSelectedConversationId(conversationId);
    setView("messages", conversationId);
  }

  function goToPage(nextPage: number) {
    setPage(Math.min(Math.max(1, nextPage), totalPages));
    marketTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="mx-auto w-full max-w-[1680px] flex-1 px-4 py-5 md:px-6 md:py-7">
      <header className="border-b border-border pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-sky-500/15 px-2 py-1 text-xs font-bold text-sky-700 dark:text-sky-300">
                Simulación aislada
              </span>
              <span className="text-xs text-muted">Datos ficticios · Production no se modifica</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold text-foreground md:text-3xl">
              Laboratorio de Vitrina
            </h1>
          </div>
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-2"
            onClick={resetSimulation}
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Restablecer
          </button>
        </div>

        <div className="mt-5 grid gap-3 border-y border-border py-4 lg:grid-cols-[minmax(260px,1.1fr)_repeat(4,minmax(120px,0.55fr))]">
          <label className="block min-w-0">
            <span className="mb-1.5 block text-xs font-semibold text-muted">Persona de esta pestaña</span>
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <select
                value={currentUser.id}
                onChange={(event) => setPersonaId(event.target.value)}
                className="input h-11 pl-10 text-sm"
                style={{ paddingLeft: "2.5rem" }}
              >
                {state.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} · {user.city}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <Metric label="Anuncios activos" value={coverage.activeListings.toLocaleString("es-ES")} />
          <Metric label="Plataformas" value={String(coverage.platforms)} />
          <Metric label="Regiones" value={String(coverage.regions)} />
          <Metric
            label="Filtro actual"
            value={filterElapsedMs.toFixed(1) + " ms"}
            hint={storedBytes > 0 ? (storedBytes / 1_048_576).toFixed(1) + " MB local" : "Semilla limpia"}
          />
        </div>
      </header>

      <nav
        className="my-5 flex max-w-full gap-1 overflow-x-auto border-b border-border"
        aria-label="Secciones del laboratorio"
      >
        {VIEW_OPTIONS.map((option) => {
          const Icon = option.icon;
          const count = option.value === "mine"
            ? ownOpenListings
            : option.value === "messages"
              ? userConversations.length
              : option.value === "notifications"
                ? unreadNotifications
                : null;
          return (
            <button
              key={option.value}
              type="button"
              className={cn(
                "inline-flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition",
                view === option.value
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground",
              )}
              aria-current={view === option.value ? "page" : undefined}
              onClick={() => setView(option.value)}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {option.label}
              {count != null && count > 0 ? (
                <span className="min-w-5 rounded-full bg-card-hover px-1.5 py-0.5 text-[10px] text-foreground">
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {!hydrated ? (
        <p className="border-y border-border py-10 text-center text-sm text-muted">
          Preparando la simulación…
        </p>
      ) : view === "market" ? (
        <MarketView
          marketTopRef={marketTopRef}
          listings={visibleListings}
          allListings={state.listings}
          currentUser={currentUser}
          filters={filters}
          filteredCount={filteredListings.length}
          page={safePage}
          totalPages={totalPages}
          onPage={goToPage}
          onFilters={(next) => {
            setFilters(next);
            setPage(1);
          }}
          onOpenListing={setSelectedListingId}
          onContact={contactListing}
        />
      ) : view === "mine" ? (
        <MyListingsView
          listings={state.listings.filter((listing) => listing.sellerId === currentUser.id)}
          onCreate={() => setEditorListingId("new")}
          onOpen={setSelectedListingId}
          onEdit={(listingId) => setEditorListingId(listingId)}
          onPublish={(listingId) => {
            const result = commit((current) =>
              publishSimulationListing(current, listingId, currentUser.id),
            );
            setToast(result.error ?? "Anuncio publicado.");
          }}
          onRemove={(listing) => {
            const verb = listing.status === "draft" ? "eliminar" : "retirar";
            if (!window.confirm("¿" + verb[0].toUpperCase() + verb.slice(1) + " este anuncio?")) return;
            const result = commit((current) =>
              removeSimulationListing(current, listing.id, currentUser.id),
            );
            setToast(result.error ?? (result.removed ? "Borrador eliminado." : "Anuncio retirado."));
          }}
        />
      ) : view === "messages" ? (
        <MessagesView
          key={currentUser.id + ":" + (selectedConversation?.id ?? "empty")}
          conversations={userConversations}
          selectedConversation={selectedConversation}
          listings={state.listings}
          currentUser={currentUser}
          onSelect={openConversation}
          onSend={(conversationId, body) => {
            const result = commit((current) =>
              addSimulationMessage(current, conversationId, currentUser.id, body),
            );
            if (result.error) setToast(result.error);
            return result.error;
          }}
          onMarkSale={(listingId, buyerId, priceEur) => {
            const result = commit((current) =>
              markSimulationSale(current, {
                listingId,
                sellerId: currentUser.id,
                buyerId,
                priceEur,
              }),
            );
            setToast(result.error ?? "Venta acordada. El comprador ya tiene el aviso.");
            return result.error;
          }}
          onConfirmReceipt={(listingId) => {
            const result = commit((current) =>
              confirmSimulationReceipt(current, listingId, currentUser.id),
            );
            setToast(result.error ?? (result.recorded ? "Recepción confirmada." : "Ya estaba confirmada."));
            return result.error;
          }}
          onBlock={(conversationId) => {
            const result = commit((current) =>
              blockSimulationConversation(current, conversationId, currentUser.id),
            );
            setToast(result.error ?? "Usuario bloqueado en esta conversación.");
          }}
        />
      ) : (
        <NotificationsView
          notifications={userNotifications}
          onRead={(ids) => {
            commit((current) => ({
              state: markSimulationNotificationsRead(current, currentUser.id, ids),
            }));
          }}
          onOpen={(item) => {
            commit((current) => ({
              state: markSimulationNotificationsRead(current, currentUser.id, [item.id]),
            }));
            if (item.conversationId) openConversation(item.conversationId);
            else if (item.listingId) setSelectedListingId(item.listingId);
          }}
        />
      )}

      {selectedListing ? (
        <ListingDetailsModal
          listing={selectedListing}
          currentUser={currentUser}
          onClose={() => setSelectedListingId(null)}
          onContact={() => contactListing(selectedListing)}
          onEdit={() => {
            setSelectedListingId(null);
            setEditorListingId(selectedListing.id);
          }}
          onConfirmReceipt={() => {
            const result = commit((current) =>
              confirmSimulationReceipt(current, selectedListing.id, currentUser.id),
            );
            setToast(result.error ?? "Recepción confirmada.");
          }}
        />
      ) : null}

      {editorListingId ? (
        <ListingEditorModal
          key={editorListingId + ":" + currentUser.id}
          listing={editorListingId === "new"
            ? null
            : state.listings.find((listing) => listing.id === editorListingId) ?? null}
          catalogGames={catalogGames}
          currentUser={currentUser}
          onClose={() => setEditorListingId(null)}
          onCreate={(input) => {
            const result = commit((current) =>
              createSimulationListing(current, {
                sellerId: currentUser.id,
                ...input,
              }),
            );
            if (result.error) return result.error;
            setEditorListingId(null);
            setToast(input.publish ? "Anuncio publicado." : "Borrador guardado.");
            return undefined;
          }}
          onUpdate={(listingId, input) => {
            const result = commit((current) =>
              updateSimulationListing(current, {
                listingId,
                sellerId: currentUser.id,
                ...input,
              }),
            );
            if (result.error) return result.error;
            setEditorListingId(null);
            setToast("Anuncio actualizado.");
            return undefined;
          }}
        />
      ) : null}

      {toast ? (
        <div
          className="fixed bottom-4 left-1/2 z-[80] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border border-border bg-foreground px-4 py-3 text-sm font-medium text-background shadow-xl"
          role="status"
        >
          {toast}
        </div>
      ) : null}
    </main>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 border-l border-border pl-3">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="mt-1 truncate text-xl font-bold tabular-nums text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 truncate text-[10px] text-muted">{hint}</p> : null}
    </div>
  );
}

function MarketView({
  marketTopRef,
  listings,
  allListings,
  currentUser,
  filters,
  filteredCount,
  page,
  totalPages,
  onPage,
  onFilters,
  onOpenListing,
  onContact,
}: {
  marketTopRef: { current: HTMLDivElement | null };
  listings: SimulationListing[];
  allListings: SimulationListing[];
  currentUser: SimulationUser;
  filters: SimulationListingFilters;
  filteredCount: number;
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
  onFilters: (filters: SimulationListingFilters) => void;
  onOpenListing: (listingId: string) => void;
  onContact: (listing: SimulationListing) => void;
}) {
  const activeListings = useMemo(
    () => allListings.filter((listing) => listing.status === "active"),
    [allListings],
  );
  const platformOptions = useMemo(
    () => uniqueOptions(activeListings.map((listing) => ({
      value: listing.platformSlug,
      label: listing.platformName,
    }))),
    [activeListings],
  );
  const regionOptions = useMemo(
    () => uniqueOptions(activeListings
      .filter((listing) =>
        filters.platform === "all" || listing.platformSlug === filters.platform,
      )
      .map((listing) => ({
        value: listing.regionKey,
        label: listing.regionLabel,
      }))),
    [activeListings, filters.platform],
  );
  const start = filteredCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(filteredCount, page * PAGE_SIZE);

  return (
    <div ref={marketTopRef} className="scroll-mt-24">
      <details className="mb-4 rounded-lg border border-border bg-card lg:hidden">
        <summary className="flex min-h-11 list-none items-center justify-between px-4 text-sm font-bold text-foreground [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <Gauge className="h-4 w-4" aria-hidden />
            Filtros
          </span>
          <span className="text-xs font-medium text-muted">{filteredCount.toLocaleString("es-ES")} resultados</span>
        </summary>
        <div className="border-t border-border p-4">
          <FiltersPanel
            filters={filters}
            platformOptions={platformOptions}
            regionOptions={regionOptions}
            onFilters={onFilters}
          />
        </div>
      </details>

      <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="sticky top-20 hidden rounded-lg border border-border bg-card p-4 lg:block">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Filtros</h2>
            {JSON.stringify(filters) !== JSON.stringify(DEFAULT_SIMULATION_FILTERS) ? (
              <button
                type="button"
                className="text-xs font-semibold text-accent"
                onClick={() => onFilters({ ...DEFAULT_SIMULATION_FILTERS })}
              >
                Limpiar
              </button>
            ) : null}
          </div>
          <FiltersPanel
            filters={filters}
            platformOptions={platformOptions}
            regionOptions={regionOptions}
            onFilters={onFilters}
          />
        </aside>

        <section aria-label="Anuncios simulados">
          <div className="mb-4 grid gap-3 border-b border-border pb-4 sm:grid-cols-[minmax(0,1fr)_220px]">
            <label className="relative block">
              <span className="sr-only">Buscar anuncios simulados</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                type="search"
                value={filters.query}
                onChange={(event) => onFilters({ ...filters, query: event.target.value })}
                className="input h-11 pl-10 text-sm"
                placeholder="Juego, vendedor, plataforma o región"
              />
            </label>
            <label>
              <span className="sr-only">Orden de los anuncios</span>
              <select
                value={filters.sort}
                onChange={(event) => onFilters({
                  ...filters,
                  sort: event.target.value as SimulationListingFilters["sort"],
                })}
                className="input h-11 text-sm"
              >
                <option value="recent">Más recientes</option>
                <option value="price-asc">Precio: menor primero</option>
                <option value="price-desc">Precio: mayor primero</option>
                <option value="distance">Más cercanos</option>
              </select>
            </label>
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {filteredCount.toLocaleString("es-ES")} anuncios
              </p>
              <p className="text-xs text-muted">
                {start.toLocaleString("es-ES")}–{end.toLocaleString("es-ES")} · desde {currentUser.city}
              </p>
            </div>
            <Pager page={page} totalPages={totalPages} onPage={onPage} />
          </div>

          {listings.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {listings.map((listing) => (
                <SimulationListingCard
                  key={listing.id}
                  listing={listing}
                  currentUser={currentUser}
                  onOpen={() => onOpenListing(listing.id)}
                  onContact={() => onContact(listing)}
                />
              ))}
            </div>
          ) : (
            <div className="border-y border-border py-14 text-center">
              <p className="font-semibold text-foreground">No hay anuncios que coincidan.</p>
              <button
                type="button"
                className="mt-3 text-sm font-semibold text-accent"
                onClick={() => onFilters({ ...DEFAULT_SIMULATION_FILTERS })}
              >
                Limpiar filtros
              </button>
            </div>
          )}

          {totalPages > 1 ? (
            <div className="mt-6 flex justify-end border-t border-border pt-4">
              <Pager page={page} totalPages={totalPages} onPage={onPage} />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function FiltersPanel({
  filters,
  platformOptions,
  regionOptions,
  onFilters,
}: {
  filters: SimulationListingFilters;
  platformOptions: Array<{ value: string; label: string }>;
  regionOptions: Array<{ value: string; label: string }>;
  onFilters: (filters: SimulationListingFilters) => void;
}) {
  return (
    <div className="space-y-4">
      <FilterSelect
        label="Plataforma"
        value={filters.platform}
        options={[{ value: "all", label: "Todas las plataformas" }, ...platformOptions]}
        onChange={(platform) => onFilters({ ...filters, platform, region: "all" })}
      />
      <FilterSelect
        label="Región"
        value={filters.region}
        options={[{ value: "all", label: "Todas las regiones" }, ...regionOptions]}
        onChange={(region) => onFilters({ ...filters, region })}
      />
      <FilterSelect
        label="Estado"
        value={filters.condition}
        options={[
          { value: "all", label: "Todos los estados" },
          ...Object.entries(SIMULATION_CONDITION_LABELS).map(([value, label]) => ({ value, label })),
        ]}
        onChange={(condition) => onFilters({
          ...filters,
          condition: condition as SimulationListingFilters["condition"],
        })}
      />
      <FilterSelect
        label="Entrega"
        value={filters.delivery}
        options={[
          { value: "all", label: "Cualquier entrega" },
          { value: "shipping", label: "Con envío" },
          { value: "pickup", label: "Trato en mano" },
        ]}
        onChange={(delivery) => onFilters({
          ...filters,
          delivery: delivery as SimulationListingFilters["delivery"],
        })}
      />
      <FilterSelect
        label="Distancia máxima"
        value={filters.radiusKm == null ? "all" : String(filters.radiusKm)}
        options={[
          { value: "all", label: "Cualquier distancia" },
          { value: "10", label: "Hasta 10 km" },
          { value: "25", label: "Hasta 25 km" },
          { value: "50", label: "Hasta 50 km" },
          { value: "100", label: "Hasta 100 km" },
          { value: "250", label: "Hasta 250 km" },
          { value: "600", label: "Hasta 600 km" },
        ]}
        onChange={(radius) => onFilters({
          ...filters,
          radiusKm: radius === "all" ? null : Number(radius),
          sort: radius === "all" ? filters.sort : "distance",
        })}
      />
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-muted">Ciudad</span>
        <div className="relative">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={filters.city}
            onChange={(event) => onFilters({ ...filters, city: event.target.value })}
            className="input h-10 pl-10 text-sm"
            placeholder="Cualquier ciudad"
          />
        </div>
      </label>
      <fieldset>
        <legend className="mb-1.5 text-xs font-semibold text-muted">Precio</legend>
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="sr-only">Precio mínimo</span>
            <input
              inputMode="decimal"
              value={inputPrice(filters.minPrice)}
              onChange={(event) => onFilters({
                ...filters,
                minPrice: event.target.value ? parsePrice(event.target.value) : null,
              })}
              className="input h-10 text-sm"
              placeholder="Desde €"
            />
          </label>
          <label>
            <span className="sr-only">Precio máximo</span>
            <input
              inputMode="decimal"
              value={inputPrice(filters.maxPrice)}
              onChange={(event) => onFilters({
                ...filters,
                maxPrice: event.target.value ? parsePrice(event.target.value) : null,
              })}
              className="input h-10 text-sm"
              placeholder="Hasta €"
            />
          </label>
        </div>
      </fieldset>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="input h-10 text-sm"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function Pager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="min-w-16 text-center text-xs tabular-nums text-muted">
        {page} / {totalPages}
      </span>
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-foreground disabled:opacity-40"
        aria-label="Página anterior"
        title="Página anterior"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-foreground disabled:opacity-40"
        aria-label="Página siguiente"
        title="Página siguiente"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

function SimulationListingCard({
  listing,
  currentUser,
  onOpen,
  onContact,
}: {
  listing: SimulationListing;
  currentUser: SimulationUser;
  onOpen: () => void;
  onContact: () => void;
}) {
  const distance = simulationListingDistanceKm(listing, currentUser.location);
  const isOwner = listing.sellerId === currentUser.id;
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition hover:border-accent/40 hover:shadow-md">
      <button
        type="button"
        className="group relative block aspect-[3/4] overflow-hidden bg-background/70 text-left"
        onClick={onOpen}
      >
        {listing.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.coverUrl}
            alt={listing.title}
            className="h-full w-full object-contain p-2"
            loading="lazy"
          />
        ) : (
          <span className="flex h-full items-center justify-center px-3 text-center text-xs text-muted">
            Sin portada catalogada
          </span>
        )}
        <span className="absolute left-2 top-2 rounded-md bg-black/75 px-2 py-1 text-[10px] font-semibold text-white">
          {SIMULATION_CONDITION_LABELS[listing.condition]}
        </span>
      </button>
      <div className="flex flex-1 flex-col p-3">
        <p className="text-xl font-bold tabular-nums text-foreground">
          {formatEurCents(listing.askingPriceEur)}
        </p>
        <button
          type="button"
          className="mt-1 line-clamp-2 min-h-10 text-left text-sm font-semibold leading-5 text-foreground hover:text-accent"
          onClick={onOpen}
        >
          {listing.title}
        </button>
        <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[11px] text-muted">
          <span className="truncate font-semibold text-foreground/80">{listing.platformName}</span>
          <span>·</span>
          <RegionFlag region={listing.region} showLabel labelMode="short" />
        </div>
        <p className="mt-2 truncate text-xs text-muted">
          {[listing.sellerCity, distanceLabel(distance)].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-1 truncate text-[11px] text-muted">Vende {listing.sellerName}</p>
        <div className="mt-2 flex min-h-5 flex-wrap gap-x-2 text-[11px] text-muted">
          {listing.shipping ? <span className="inline-flex items-center gap-1"><Truck className="h-3 w-3" aria-hidden /> Envío</span> : null}
          {listing.pickup ? <span className="inline-flex items-center gap-1"><Handshake className="h-3 w-3" aria-hidden /> En mano</span> : null}
        </div>
        <div className="mt-auto border-t border-border pt-3">
          <button
            type="button"
            className={cn(
              "inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold transition",
              isOwner
                ? "border border-border text-foreground hover:bg-card-hover"
                : "bg-accent text-accent-fg hover:opacity-90",
            )}
            onClick={onContact}
          >
            {isOwner ? <Edit3 className="h-4 w-4" aria-hidden /> : <MessageCircle className="h-4 w-4" aria-hidden />}
            {isOwner ? "Gestionar" : "Contactar"}
          </button>
        </div>
      </div>
    </article>
  );
}

function MyListingsView({
  listings,
  onCreate,
  onOpen,
  onEdit,
  onPublish,
  onRemove,
}: {
  listings: SimulationListing[];
  onCreate: () => void;
  onOpen: (listingId: string) => void;
  onEdit: (listingId: string) => void;
  onPublish: (listingId: string) => void;
  onRemove: (listing: SimulationListing) => void;
}) {
  const ordered = [...listings].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const openCount = ordered.filter((listing) => listing.status === "active" || listing.status === "draft").length;
  const soldCount = ordered.filter((listing) => listing.status === "sold").length;

  return (
    <section className="mx-auto max-w-5xl" aria-labelledby="my-listings-title">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 id="my-listings-title" className="text-xl font-bold text-foreground">Mis anuncios simulados</h2>
          <p className="mt-1 text-sm text-muted">{openCount} abiertos · {soldCount} vendidos</p>
        </div>
        <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={onCreate}>
          <Plus className="h-4 w-4" aria-hidden />
          Subir juego
        </button>
      </header>

      {ordered.length === 0 ? (
        <div className="border-y border-border py-12 text-center">
          <p className="text-sm text-muted">Esta persona aún no tiene anuncios.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {ordered.map((listing) => {
            const canManage = listing.status === "active" || listing.status === "draft";
            return (
              <li key={listing.id} className="grid gap-3 py-3 sm:grid-cols-[56px_minmax(0,1fr)_auto] sm:items-center">
                <button
                  type="button"
                  className="flex h-16 w-14 items-center justify-center overflow-hidden rounded-md border border-border bg-background"
                  onClick={() => onOpen(listing.id)}
                  aria-label={"Abrir " + listing.title}
                >
                  {listing.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={listing.coverUrl} alt="" className="h-full w-full object-contain p-1" loading="lazy" />
                  ) : (
                    <ShoppingBag className="h-5 w-5 text-muted" aria-hidden />
                  )}
                </button>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="truncate text-left text-sm font-bold text-foreground hover:text-accent"
                      onClick={() => onOpen(listing.id)}
                    >
                      {listing.title}
                    </button>
                    <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-semibold", statusTone(listing.status))}>
                      {statusLabel(listing.status)}
                    </span>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                    <span>{listing.platformName}</span>
                    <span>·</span>
                    <RegionFlag region={listing.region} showLabel labelMode="short" />
                    <span>·</span>
                    <span>{SIMULATION_CONDITION_LABELS[listing.condition]}</span>
                    <span>·</span>
                    <strong className="text-foreground">{formatEurCents(listing.recordedSalePriceEur ?? listing.askingPriceEur)}</strong>
                  </p>
                  <p className="mt-1 text-[11px] text-muted">{formatWhen(listing.updatedAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  {listing.status === "draft" ? (
                    <button
                      type="button"
                      className="btn-primary h-9 gap-2 px-3 text-xs"
                      onClick={() => onPublish(listing.id)}
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      Publicar
                    </button>
                  ) : null}
                  {canManage ? (
                    <button
                      type="button"
                      className="btn-secondary h-9 gap-2 px-3 text-xs"
                      onClick={() => onEdit(listing.id)}
                    >
                      <Edit3 className="h-3.5 w-3.5" aria-hidden />
                      Editar
                    </button>
                  ) : null}
                  {canManage ? (
                    <button
                      type="button"
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold text-rose-700 transition hover:border-rose-400/50 dark:text-rose-300"
                      onClick={() => onRemove(listing)}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      {listing.status === "draft" ? "Eliminar" : "Retirar"}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function MessagesView({
  conversations,
  selectedConversation,
  listings,
  currentUser,
  onSelect,
  onSend,
  onMarkSale,
  onConfirmReceipt,
  onBlock,
}: {
  conversations: SimulationConversation[];
  selectedConversation: SimulationConversation | null;
  listings: SimulationListing[];
  currentUser: SimulationUser;
  onSelect: (conversationId: string) => void;
  onSend: (conversationId: string, body: string) => string | undefined;
  onMarkSale: (listingId: string, buyerId: string, priceEur: number) => string | undefined;
  onConfirmReceipt: (listingId: string) => string | undefined;
  onBlock: (conversationId: string) => void;
}) {
  const [message, setMessage] = useState("");
  const selectedListing = selectedConversation
    ? listings.find((listing) => listing.id === selectedConversation.listingId) ?? null
    : null;
  const [salePrice, setSalePrice] = useState(
    selectedListing ? String(selectedListing.recordedSalePriceEur ?? selectedListing.askingPriceEur) : "",
  );
  const [formError, setFormError] = useState<string | null>(null);

  function send(event: FormEvent) {
    event.preventDefault();
    if (!selectedConversation) return;
    const error = onSend(selectedConversation.id, message);
    setFormError(error ?? null);
    if (!error) setMessage("");
  }

  function markSale() {
    if (!selectedConversation || !selectedListing) return;
    const price = parsePrice(salePrice);
    if (price == null || price <= 0) {
      setFormError("Indica un precio final válido.");
      return;
    }
    setFormError(onMarkSale(selectedListing.id, selectedConversation.buyerId, price) ?? null);
  }

  if (conversations.length === 0) {
    return (
      <section className="mx-auto max-w-3xl border-y border-border py-14 text-center">
        <Inbox className="mx-auto h-7 w-7 text-muted" aria-hidden />
        <h2 className="mt-3 font-bold text-foreground">Sin conversaciones</h2>
        <p className="mt-1 text-sm text-muted">Contacta con otro vendedor desde Mercado.</p>
      </section>
    );
  }

  const isSeller = selectedConversation?.sellerId === currentUser.id;
  const isBuyer = selectedConversation?.buyerId === currentUser.id;
  const peerId = selectedConversation
    ? isSeller
      ? selectedConversation.buyerId
      : selectedConversation.sellerId
    : null;
  const peerName = selectedConversation
    ? isSeller
      ? selectedConversation.buyerName
      : selectedConversation.sellerName
    : null;

  return (
    <section className="grid min-h-[620px] overflow-hidden rounded-lg border border-border bg-card lg:grid-cols-[330px_minmax(0,1fr)]">
      <div className="border-b border-border lg:border-r lg:border-b-0">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-bold text-foreground">Conversaciones</h2>
          <p className="mt-0.5 text-xs text-muted">{conversations.length} como comprador o vendedor</p>
        </div>
        <ul className="max-h-64 divide-y divide-border overflow-y-auto lg:max-h-[560px]">
          {conversations.map((conversation) => {
            const listing = listings.find((entry) => entry.id === conversation.listingId);
            const sellerView = conversation.sellerId === currentUser.id;
            const peer = sellerView ? conversation.buyerName : conversation.sellerName;
            const last = conversation.messages.at(-1);
            return (
              <li key={conversation.id}>
                <button
                  type="button"
                  className={cn(
                    "block w-full px-4 py-3 text-left transition hover:bg-card-hover",
                    selectedConversation?.id === conversation.id && "bg-accent/10",
                  )}
                  onClick={() => onSelect(conversation.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-bold text-foreground">
                      {listing?.title ?? "Anuncio"}
                    </p>
                    <span className="shrink-0 text-[10px] text-muted">{formatWhen(conversation.updatedAt)}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted">{sellerView ? "Compra" : "Vende"} {peer}</p>
                  <p className="mt-1 truncate text-xs text-muted">{last?.body ?? "Chat abierto"}</p>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {selectedConversation ? (
        <div className="flex min-h-0 flex-col">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <h3 className="truncate font-bold text-foreground">{selectedListing?.title ?? "Anuncio"}</h3>
              <p className="mt-0.5 text-xs text-muted">
                {isSeller ? "Comprador" : "Vendedor"}: {peerName}
                {selectedListing ? " · " + statusLabel(selectedListing.status) : ""}
              </p>
            </div>
            {peerId ? (
              <div className="flex flex-wrap gap-2">
                <Link
                  href={"/laboratorio/vitrina?usuario=" + encodeURIComponent(peerId) + "&vista=messages&conversacion=" + encodeURIComponent(selectedConversation.id)}
                  target="_blank"
                  className="btn-secondary h-9 gap-2 px-3 text-xs"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  Abrir como {peerName}
                </Link>
                <button
                  type="button"
                  className="h-9 rounded-lg border border-border px-3 text-xs font-semibold text-muted transition hover:text-rose-600 dark:hover:text-rose-300"
                  disabled={selectedConversation.blockedByUserIds.length > 0}
                  onClick={() => {
                    if (window.confirm("¿Bloquear esta conversación simulada?")) onBlock(selectedConversation.id);
                  }}
                >
                  Bloquear
                </button>
              </div>
            ) : null}
          </header>

          <div className="min-h-72 flex-1 space-y-3 overflow-y-auto bg-background/30 p-4">
            {selectedConversation.messages.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">Aún no hay mensajes.</p>
            ) : null}
            {selectedConversation.messages.map((entry) => (
              <div
                key={entry.id}
                className={cn(
                  "max-w-[82%] rounded-lg px-3 py-2 text-sm",
                  entry.senderId === currentUser.id
                    ? "ml-auto bg-accent text-accent-fg"
                    : "bg-card-hover text-foreground",
                )}
              >
                <div className={cn(
                  "mb-1 flex items-center justify-between gap-3 text-[10px]",
                  entry.senderId === currentUser.id ? "text-accent-fg/75" : "text-muted",
                )}>
                  <span>{entry.senderName}</span>
                  <time>{formatWhen(entry.createdAt)}</time>
                </div>
                <p>{entry.body}</p>
              </div>
            ))}
          </div>

          {formError ? (
            <p className="border-t border-rose-400/30 bg-rose-500/10 px-4 py-2 text-xs text-rose-700 dark:text-rose-300">
              {formError}
            </p>
          ) : null}

          {selectedConversation.blockedByUserIds.length > 0 ? (
            <p className="border-t border-border px-4 py-4 text-sm text-muted">Conversación bloqueada.</p>
          ) : (
            <form className="flex gap-2 border-t border-border p-3" onSubmit={send}>
              <input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="input h-11 flex-1"
                maxLength={2_000}
                placeholder="Escribe un mensaje"
              />
              <button
                type="submit"
                className="btn-primary h-11 w-11 p-0"
                aria-label="Enviar mensaje"
                title="Enviar mensaje"
                disabled={!message.trim()}
              >
                <Send className="h-4 w-4" aria-hidden />
              </button>
            </form>
          )}

          {selectedListing?.status === "active" && isSeller ? (
            <div className="grid gap-2 border-t border-border bg-amber-500/5 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-muted">Precio acordado</span>
                <input
                  value={salePrice}
                  onChange={(event) => setSalePrice(event.target.value)}
                  inputMode="decimal"
                  className="input h-10"
                />
              </label>
              <button type="button" className="btn-primary h-10 gap-2" onClick={markSale}>
                <Handshake className="h-4 w-4" aria-hidden />
                Marcar como vendido
              </button>
            </div>
          ) : null}

          {selectedListing?.status === "sold" ? (
            <div className="border-t border-border bg-sky-500/5 p-4">
              <p className="text-sm font-bold text-foreground">
                Acuerdo por {formatEurCents(selectedListing.recordedSalePriceEur)}
              </p>
              <p className="mt-1 text-xs text-muted">
                {selectedListing.buyerConfirmedAt
                  ? "Recepción confirmada; operación completada."
                  : isBuyer
                    ? "Pendiente de que confirmes la recepción."
                    : "Pendiente de confirmación del comprador."}
              </p>
              {isBuyer && !selectedListing.buyerConfirmedAt ? (
                <button
                  type="button"
                  className="btn-primary mt-3 gap-2"
                  onClick={() => setFormError(onConfirmReceipt(selectedListing.id) ?? null)}
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden />
                  He recibido el juego
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function NotificationsView({
  notifications,
  onRead,
  onOpen,
}: {
  notifications: SimulationNotification[];
  onRead: (ids?: string[]) => void;
  onOpen: (notification: SimulationNotification) => void;
}) {
  const unread = notifications.filter((item) => !item.readAt).length;
  return (
    <section className="mx-auto max-w-3xl" aria-labelledby="notifications-title">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 id="notifications-title" className="text-xl font-bold text-foreground">Notificaciones simuladas</h2>
          <p className="mt-1 text-sm text-muted">{unread === 0 ? "Todo leído" : unread + " sin leer"}</p>
        </div>
        {unread > 0 ? (
          <button type="button" className="btn-secondary gap-2" onClick={() => onRead()}>
            <CheckCheck className="h-4 w-4" aria-hidden />
            Marcar todo como leído
          </button>
        ) : null}
      </header>

      {notifications.length === 0 ? (
        <p className="border-y border-border py-12 text-center text-sm text-muted">
          Esta persona no tiene avisos.
        </p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {notifications.map((item) => {
            const Icon = notificationIcon(item.kind);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-start gap-3 px-2 py-4 text-left transition hover:bg-card-hover md:px-3",
                    !item.readAt && "bg-accent/8",
                  )}
                  onClick={() => onOpen(item)}
                >
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card-hover text-accent">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm text-foreground", item.readAt ? "font-medium" : "font-bold")}>
                      {item.title}
                    </span>
                    {item.body ? <span className="mt-1 block text-sm text-muted">{item.body}</span> : null}
                    <time className="mt-1.5 block text-xs text-muted">{formatWhen(item.createdAt)}</time>
                  </span>
                  {!item.readAt ? (
                    <span className="mt-3 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Sin leer" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ModalShell({
  title,
  onClose,
  children,
  widthClass = "max-w-3xl",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  widthClass?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className={cn(
          "max-h-[94vh] w-full overflow-y-auto rounded-t-lg border border-border bg-background shadow-2xl sm:rounded-lg",
          widthClass,
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
          <h2 className="truncate font-bold text-foreground">{title}</h2>
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted hover:text-foreground"
            aria-label="Cerrar"
            title="Cerrar"
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function ListingDetailsModal({
  listing,
  currentUser,
  onClose,
  onContact,
  onEdit,
  onConfirmReceipt,
}: {
  listing: SimulationListing;
  currentUser: SimulationUser;
  onClose: () => void;
  onContact: () => void;
  onEdit: () => void;
  onConfirmReceipt: () => void;
}) {
  const isOwner = listing.sellerId === currentUser.id;
  const isBuyer = listing.soldToUserId === currentUser.id;
  const distance = simulationListingDistanceKm(listing, currentUser.location);
  return (
    <ModalShell title={listing.title} onClose={onClose}>
      <div className="grid gap-5 p-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:p-5">
        <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg border border-border bg-card">
          {listing.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={listing.coverUrl} alt={listing.title} className="h-full w-full object-contain p-3" />
          ) : (
            <ShoppingBag className="h-8 w-8 text-muted" aria-hidden />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-md px-2 py-1 text-xs font-bold", statusTone(listing.status))}>
              {statusLabel(listing.status)}
            </span>
            <span className="rounded-md border border-border bg-card px-2 py-1 text-xs font-semibold text-foreground">
              {SIMULATION_CONDITION_LABELS[listing.condition]}
            </span>
          </div>
          <p className="mt-4 text-3xl font-bold tabular-nums text-foreground">
            {formatEurCents(listing.recordedSalePriceEur ?? listing.askingPriceEur)}
          </p>
          <p className="mt-3 text-sm leading-6 text-foreground/85">{listing.description}</p>

          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-border py-4 text-sm">
            <div>
              <dt className="text-xs font-semibold text-muted">Plataforma</dt>
              <dd className="mt-1 font-medium text-foreground">{listing.platformName}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted">Región</dt>
              <dd className="mt-1"><RegionFlag region={listing.region} showLabel /></dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted">Vendedor</dt>
              <dd className="mt-1 font-medium text-foreground">{listing.sellerName}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted">Ubicación</dt>
              <dd className="mt-1 font-medium text-foreground">
                {[listing.sellerCity, distanceLabel(distance)].filter(Boolean).join(" · ")}
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-wrap gap-3 text-sm text-muted">
            {listing.shipping ? <span className="inline-flex items-center gap-1.5"><Truck className="h-4 w-4" aria-hidden /> Envío</span> : null}
            {listing.pickup ? <span className="inline-flex items-center gap-1.5"><Handshake className="h-4 w-4" aria-hidden /> Trato en mano</span> : null}
            <span>{formatWhen(listing.publishedAt)}</span>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {isOwner && (listing.status === "active" || listing.status === "draft") ? (
              <button type="button" className="btn-primary gap-2" onClick={onEdit}>
                <Edit3 className="h-4 w-4" aria-hidden />
                Editar anuncio
              </button>
            ) : listing.status === "active" ? (
              <button type="button" className="btn-primary gap-2" onClick={onContact}>
                <MessageCircle className="h-4 w-4" aria-hidden />
                Abrir chat
              </button>
            ) : null}
            {isBuyer && listing.status === "sold" && !listing.buyerConfirmedAt ? (
              <button type="button" className="btn-primary gap-2" onClick={onConfirmReceipt}>
                <ShieldCheck className="h-4 w-4" aria-hidden />
                He recibido el juego
              </button>
            ) : null}
            <Link
              href={listing.catalogHref}
              target="_blank"
              className="btn-secondary gap-2"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              Ficha de catálogo
            </Link>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

type ListingEditorInput = {
  title: string;
  description: string;
  askingPriceEur: number;
  pickup: boolean;
  shipping: boolean;
};

function ListingEditorModal({
  listing,
  catalogGames,
  currentUser,
  onClose,
  onCreate,
  onUpdate,
}: {
  listing: SimulationListing | null;
  catalogGames: SimulationCatalogGame[];
  currentUser: SimulationUser;
  onClose: () => void;
  onCreate: (input: {
    game: SimulationCatalogGame;
    condition: CollectionCondition;
    askingPriceEur: number;
    description: string;
    pickup: boolean;
    shipping: boolean;
    publish: boolean;
  }) => string | undefined;
  onUpdate: (listingId: string, input: ListingEditorInput) => string | undefined;
}) {
  const initialGame = listing
    ? catalogGames.find((game) => game.id === listing.catalogId) ?? catalogGames[0]
    : catalogGames[0];
  const [gameQuery, setGameQuery] = useState("");
  const [selectedGameId, setSelectedGameId] = useState(initialGame.id);
  const [title, setTitle] = useState(listing?.title ?? initialGame.title);
  const [description, setDescription] = useState(listing?.description ?? "");
  const [condition, setCondition] = useState<CollectionCondition>(listing?.condition ?? "complete");
  const [askingPrice, setAskingPrice] = useState(
    String(listing?.askingPriceEur ?? initialGame.referencePriceEur ?? 25),
  );
  const [pickup, setPickup] = useState(listing?.pickup ?? true);
  const [shipping, setShipping] = useState(listing?.shipping ?? true);
  const [error, setError] = useState<string | null>(null);
  const selectedGame = catalogGames.find((game) => game.id === selectedGameId) ?? initialGame;
  const filteredGames = useMemo(() => {
    const query = normalizeSimulationSearch(gameQuery);
    if (!query) return catalogGames.slice(0, 80);
    return catalogGames.filter((game) =>
      normalizeSimulationSearch([
        game.title,
        game.platformName,
        game.regionLabel,
      ].join(" ")).includes(query),
    ).slice(0, 80);
  }, [catalogGames, gameQuery]);

  function selectGame(game: SimulationCatalogGame) {
    setSelectedGameId(game.id);
    setTitle(game.title);
    setAskingPrice(String(game.referencePriceEur ?? 25));
  }

  function saveCreate(publish: boolean) {
    const price = parsePrice(askingPrice);
    if (price == null || price <= 0) {
      setError("Indica un precio válido.");
      return;
    }
    setError(onCreate({
      game: selectedGame,
      condition,
      askingPriceEur: price,
      description,
      pickup,
      shipping,
      publish,
    }) ?? null);
  }

  function saveUpdate(event: FormEvent) {
    event.preventDefault();
    if (!listing) return;
    const price = parsePrice(askingPrice);
    if (price == null || price <= 0) {
      setError("Indica un precio válido.");
      return;
    }
    setError(onUpdate(listing.id, {
      title,
      description,
      askingPriceEur: price,
      pickup,
      shipping,
    }) ?? null);
  }

  return (
    <ModalShell
      title={listing ? "Editar anuncio" : "Subir juego a Vitrina"}
      onClose={onClose}
      widthClass="max-w-4xl"
    >
      <form onSubmit={saveUpdate}>
        <div className="grid gap-6 p-4 md:grid-cols-[280px_minmax(0,1fr)] md:p-5">
          <div className="min-w-0">
            {!listing ? (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-muted">Buscar en el catálogo de prueba</span>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
                    <input
                      type="search"
                      value={gameQuery}
                      onChange={(event) => setGameQuery(event.target.value)}
                      className="input h-10 pl-10 text-sm"
                      placeholder="Título, plataforma o región"
                    />
                  </div>
                </label>
                <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-border">
                  {filteredGames.map((game) => (
                    <button
                      key={game.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left last:border-b-0",
                        game.id === selectedGame.id ? "bg-accent/12" : "hover:bg-card-hover",
                      )}
                      onClick={() => selectGame(game)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-foreground">{game.title}</span>
                        <span className="mt-0.5 block truncate text-[10px] text-muted">
                          {game.platformName} · {game.regionLabel}
                        </span>
                      </span>
                      {game.id === selectedGame.id ? <ShieldCheck className="h-4 w-4 shrink-0 text-accent" aria-hidden /> : null}
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            <div className={cn(
              "flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg border border-border bg-card",
              !listing && "mt-4",
            )}>
              {selectedGame.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selectedGame.coverUrl} alt={selectedGame.title} className="h-full w-full object-contain p-3" />
              ) : (
                <ShoppingBag className="h-8 w-8 text-muted" aria-hidden />
              )}
            </div>
            <p className="mt-2 text-center text-[11px] font-semibold text-muted">Portada actual del catálogo</p>
          </div>

          <div className="min-w-0 space-y-4">
            <div className="rounded-lg border border-sky-400/25 bg-sky-500/10 px-3 py-2 text-xs text-sky-800 dark:text-sky-200">
              <strong>{currentUser.name}</strong> · {currentUser.city} · anuncio ficticio
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-muted">Título del anuncio</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="input h-11"
                maxLength={140}
                disabled={!listing}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-muted">Estado</span>
                <select
                  value={condition}
                  onChange={(event) => setCondition(event.target.value as CollectionCondition)}
                  className="input h-11"
                  disabled={Boolean(listing)}
                >
                  {Object.entries(SIMULATION_CONDITION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-muted">Precio (€)</span>
                <input
                  inputMode="decimal"
                  value={askingPrice}
                  onChange={(event) => setAskingPrice(event.target.value)}
                  className="input h-11"
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-muted">Descripción</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="input min-h-28 resize-y"
                maxLength={1_000}
                placeholder="Estado, contenido y observaciones"
              />
            </label>
            <fieldset>
              <legend className="mb-2 text-xs font-semibold text-muted">Entrega</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-card px-3 text-sm text-foreground">
                  <input type="checkbox" checked={shipping} onChange={(event) => setShipping(event.target.checked)} />
                  <Truck className="h-4 w-4 text-muted" aria-hidden />
                  Envío
                </label>
                <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-card px-3 text-sm text-foreground">
                  <input type="checkbox" checked={pickup} onChange={(event) => setPickup(event.target.checked)} />
                  <Handshake className="h-4 w-4 text-muted" aria-hidden />
                  Trato en mano
                </label>
              </div>
            </fieldset>
            {error ? (
              <p className="flex items-start gap-2 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {error}
              </p>
            ) : null}
          </div>
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-border bg-card/50 px-4 py-3">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          {listing ? (
            <button type="submit" className="btn-primary gap-2">
              <Save className="h-4 w-4" aria-hidden />
              Guardar cambios
            </button>
          ) : (
            <>
              <button type="button" className="btn-secondary gap-2" onClick={() => saveCreate(false)}>
                <Save className="h-4 w-4" aria-hidden />
                Guardar borrador
              </button>
              <button type="button" className="btn-primary gap-2" onClick={() => saveCreate(true)}>
                <ExternalLink className="h-4 w-4" aria-hidden />
                Publicar
              </button>
            </>
          )}
        </footer>
      </form>
    </ModalShell>
  );
}
