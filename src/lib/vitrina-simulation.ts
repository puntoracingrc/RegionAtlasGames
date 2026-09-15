import { offerDistanceKm, type OfferCoordinates } from "./catalog-offer-sort";
import type { CollectionCondition } from "./types";

export const VITRINA_SIMULATION_VERSION = "vitrina-lab-2026-09-14-v3";
export const VITRINA_SIMULATION_LISTING_COUNT = 3_200;

export type SimulationCatalogGame = {
  id: string;
  title: string;
  catalogHref: string;
  coverUrl: string | null;
  platformSlug: string;
  platformName: string;
  region: string;
  regionKey: string;
  regionLabel: string;
  regionShortLabel: string;
  referencePriceEur: number | null;
};

export type SimulationUser = {
  id: string;
  name: string;
  city: string;
  location: OfferCoordinates;
  rating: number;
  sales: number;
};

export type SimulationListingStatus = "draft" | "active" | "sold" | "cancelled";

export type SimulationListing = {
  id: string;
  catalogId: string;
  catalogHref: string;
  title: string;
  description: string;
  coverUrl: string | null;
  platformSlug: string;
  platformName: string;
  region: string;
  regionKey: string;
  regionLabel: string;
  regionShortLabel: string;
  condition: CollectionCondition;
  askingPriceEur: number;
  sellerId: string;
  sellerName: string;
  sellerCity: string;
  sellerLocation: OfferCoordinates | null;
  pickup: boolean;
  shipping: boolean;
  status: SimulationListingStatus;
  publishedAt: string | null;
  updatedAt: string;
  soldToUserId: string | null;
  soldToUserName: string | null;
  sellerConfirmedAt: string | null;
  buyerConfirmedAt: string | null;
  recordedSalePriceEur: number | null;
  searchText: string;
};

export type SimulationMessage = {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
};

export type SimulationConversation = {
  id: string;
  listingId: string;
  catalogId: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  messages: SimulationMessage[];
  blockedByUserIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type SimulationNotificationKind =
  | "new_message"
  | "listing_created"
  | "listing_updated"
  | "sale_marked"
  | "sale_completed";

export type SimulationNotification = {
  id: string;
  recipientId: string;
  kind: SimulationNotificationKind;
  title: string;
  body: string | null;
  conversationId: string | null;
  listingId: string | null;
  createdAt: string;
  readAt: string | null;
};

export type VitrinaSimulationState = {
  schemaVersion: 1;
  seedVersion: string;
  revision: number;
  updatedAt: string;
  users: SimulationUser[];
  listings: SimulationListing[];
  conversations: SimulationConversation[];
  notifications: SimulationNotification[];
};

export type SimulationListingSort = "recent" | "price-asc" | "price-desc" | "distance";

export type SimulationListingFilters = {
  query: string;
  platform: string;
  region: string;
  condition: CollectionCondition | "all";
  delivery: "all" | "shipping" | "pickup";
  city: string;
  minPrice: number | null;
  maxPrice: number | null;
  radiusKm: number | null;
  sort: SimulationListingSort;
};

export const DEFAULT_SIMULATION_FILTERS: SimulationListingFilters = {
  query: "",
  platform: "all",
  region: "all",
  condition: "all",
  delivery: "all",
  city: "",
  minPrice: null,
  maxPrice: null,
  radiusKm: null,
  sort: "recent",
};

export const SIMULATION_CONDITION_LABELS: Record<CollectionCondition, string> = {
  sealed: "Precintado",
  complete: "Completo",
  "game-manual": "Juego + manual",
  loose: "Solo juego",
  unknown: "Estado sin indicar",
};

const CITIES: Array<{ city: string; latitude: number; longitude: number }> = [
  { city: "Madrid", latitude: 40.4168, longitude: -3.7038 },
  { city: "Barcelona", latitude: 41.3874, longitude: 2.1686 },
  { city: "Valencia", latitude: 39.4699, longitude: -0.3763 },
  { city: "Sevilla", latitude: 37.3891, longitude: -5.9845 },
  { city: "Zaragoza", latitude: 41.6488, longitude: -0.8891 },
  { city: "Málaga", latitude: 36.7213, longitude: -4.4214 },
  { city: "Murcia", latitude: 37.9922, longitude: -1.1307 },
  { city: "Palma", latitude: 39.5696, longitude: 2.6502 },
  { city: "Bilbao", latitude: 43.263, longitude: -2.935 },
  { city: "Alicante", latitude: 38.3452, longitude: -0.481 },
  { city: "Córdoba", latitude: 37.8882, longitude: -4.7794 },
  { city: "Valladolid", latitude: 41.6523, longitude: -4.7245 },
  { city: "Vigo", latitude: 42.2406, longitude: -8.7207 },
  { city: "Gijón", latitude: 43.5322, longitude: -5.6611 },
  { city: "A Coruña", latitude: 43.3623, longitude: -8.4115 },
  { city: "Granada", latitude: 37.1773, longitude: -3.5986 },
  { city: "Vitoria-Gasteiz", latitude: 42.8467, longitude: -2.6726 },
  { city: "Oviedo", latitude: 43.3614, longitude: -5.8494 },
  { city: "Pamplona", latitude: 42.8125, longitude: -1.6458 },
  { city: "Santander", latitude: 43.4623, longitude: -3.81 },
  { city: "Salamanca", latitude: 40.9701, longitude: -5.6635 },
  { city: "Toledo", latitude: 39.8628, longitude: -4.0273 },
  { city: "Tarragona", latitude: 41.1189, longitude: 1.2445 },
  { city: "Cerdanyola del Vallès", latitude: 41.4914, longitude: 2.1408 },
];

const FIRST_NAMES = [
  "Alex", "Andrea", "Bruno", "Carla", "Dani", "Elena", "Fran", "Gema",
  "Hugo", "Irene", "Javi", "Laura", "Marcos", "Nerea", "Óscar", "Paula",
  "Raúl", "Sara", "Tomás", "Vega",
];

const LAST_NAMES = [
  "Atlas", "Arcade", "Cartucho", "Checkpoint", "Combo", "Consola", "Continue",
  "Crédito", "Distrito", "Edición", "Joystick", "Mapa", "Memory", "Nivel",
  "Pixel", "Región", "Retro", "Select", "Start", "Vitrina",
];

const CONDITIONS: CollectionCondition[] = [
  "complete",
  "sealed",
  "loose",
  "game-manual",
  "unknown",
];

const DESCRIPTION_SNIPPETS = [
  "Conservado en estantería y listo para entrega.",
  "Edición de mi colección personal. Se entrega bien protegida.",
  "Puedo enviar o quedar en persona según la zona.",
  "Estado detallado en las fotos; pregunta cualquier duda por chat.",
  "Precio algo negociable si se agrupa con otro anuncio.",
];

const CHAT_LINES = [
  "Hola, ¿sigue disponible?",
  "Sí, sigue disponible. ¿Te interesaría envío o trato en mano?",
  "Prefiero envío. ¿La caja está completa?",
  "Sí, incluye todo lo indicado en el anuncio.",
  "Perfecto, ¿te encaja el precio publicado?",
  "Sí, podemos cerrar el acuerdo.",
];

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeSimulationSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function listingSearchText(listing: Pick<
  SimulationListing,
  "title" | "platformName" | "regionLabel" | "sellerName" | "sellerCity"
>): string {
  return normalizeSimulationSearch([
    listing.title,
    listing.platformName,
    listing.regionLabel,
    listing.sellerName,
    listing.sellerCity,
  ].join(" "));
}

function createUsers(): SimulationUser[] {
  return Array.from({ length: 80 }, (_, index) => {
    const city = CITIES[(index * 7) % CITIES.length];
    const offset = ((index % 5) - 2) * 0.018;
    return {
      id: `sim-user-${String(index + 1).padStart(3, "0")}`,
      name: `${FIRST_NAMES[index % FIRST_NAMES.length]} ${LAST_NAMES[
        (index * 9 + Math.floor(index / FIRST_NAMES.length)) % LAST_NAMES.length
      ]}`,
      city: city.city,
      location: {
        latitude: Math.round((city.latitude + offset) * 10_000) / 10_000,
        longitude: Math.round((city.longitude - offset / 2) * 10_000) / 10_000,
      },
      rating: Math.round((4.2 + (index % 8) * 0.1) * 10) / 10,
      sales: 2 + ((index * 13) % 94),
    };
  });
}

function listingPrice(game: SimulationCatalogGame, index: number, condition: CollectionCondition): number {
  const hash = hashString(`${game.id}:${index}`);
  const fallback = 6 + (hash % 8_500) / 100;
  const rarePremium = index % 97 === 0 ? 4 + (hash % 700) / 100 : 1;
  const base = Math.max(3, game.referencePriceEur ?? fallback) * rarePremium;
  const multiplier = condition === "sealed"
    ? 1.55
    : condition === "complete"
      ? 1
      : condition === "game-manual"
        ? 0.78
        : condition === "loose"
          ? 0.58
          : 0.88;
  return Math.min(4_999, roundMoney(base * multiplier + (index % 7) * 0.5));
}

function buildListing(
  game: SimulationCatalogGame,
  seller: SimulationUser,
  index: number,
): SimulationListing {
  const condition = CONDITIONS[(index * 3) % CONDITIONS.length];
  const status: SimulationListingStatus = index % 53 === 0
    ? "cancelled"
    : index % 41 === 0
      ? "sold"
      : index % 31 === 0
        ? "draft"
        : "active";
  const publishedAt = status === "draft"
    ? null
    : new Date(Date.UTC(2026, 8, 14, 8, 0, 0) - index * 37 * 60_000).toISOString();
  const askingPriceEur = listingPrice(game, index, condition);
  const listing: SimulationListing = {
    id: `sim-listing-${String(index + 1).padStart(5, "0")}`,
    catalogId: game.id,
    catalogHref: game.catalogHref,
    title: game.title,
    description: DESCRIPTION_SNIPPETS[index % DESCRIPTION_SNIPPETS.length],
    coverUrl: game.coverUrl,
    platformSlug: game.platformSlug,
    platformName: game.platformName,
    region: game.region,
    regionKey: game.regionKey,
    regionLabel: game.regionLabel,
    regionShortLabel: game.regionShortLabel,
    condition,
    askingPriceEur,
    sellerId: seller.id,
    sellerName: seller.name,
    sellerCity: seller.city,
    sellerLocation: index % 11 === 0 ? null : seller.location,
    pickup: index % 4 !== 0,
    shipping: index % 5 !== 0,
    status,
    publishedAt,
    updatedAt: publishedAt ?? new Date(Date.UTC(2026, 8, 13, 8, 0, 0) - index * 19 * 60_000).toISOString(),
    soldToUserId: null,
    soldToUserName: null,
    sellerConfirmedAt: null,
    buyerConfirmedAt: null,
    recordedSalePriceEur: null,
    searchText: "",
  };

  if (status === "sold") {
    const buyerIndex = (index * 5 + 1) % 80;
    const buyerId = `sim-user-${String(buyerIndex + 1).padStart(3, "0")}`;
    listing.soldToUserId = buyerId === seller.id ? "sim-user-080" : buyerId;
    listing.soldToUserName = "Compra simulada";
    listing.sellerConfirmedAt = listing.updatedAt;
    listing.recordedSalePriceEur = roundMoney(askingPriceEur * 0.92);
    if (index % 82 === 0) listing.buyerConfirmedAt = listing.updatedAt;
  }
  listing.searchText = listingSearchText(listing);
  return listing;
}

function seedConversations(
  listings: SimulationListing[],
  users: SimulationUser[],
): { conversations: SimulationConversation[]; notifications: SimulationNotification[] } {
  const eligible = listings.filter((listing) => listing.status === "active" || listing.status === "sold");
  const conversations: SimulationConversation[] = [];
  const notifications: SimulationNotification[] = [];

  for (let index = 0; index < Math.min(180, eligible.length); index += 1) {
    const listing = eligible[(index * 17) % eligible.length];
    const seller = users.find((user) => user.id === listing.sellerId)!;
    let buyer = index % 6 === 0 ? users[0] : users[(index * 11 + 3) % users.length];
    if (buyer.id === seller.id) buyer = users[(users.indexOf(buyer) + 1) % users.length];
    if (listing.status === "sold" && listing.soldToUserId) {
      buyer = users.find((user) => user.id === listing.soldToUserId) ?? buyer;
      listing.soldToUserName = buyer.name;
    }
    const createdAt = new Date(Date.UTC(2026, 8, 14, 7, 30, 0) - index * 53 * 60_000).toISOString();
    const messageCount = 1 + (index % CHAT_LINES.length);
    const messages = Array.from({ length: messageCount }, (_, messageIndex) => ({
      id: `sim-message-${index + 1}-${messageIndex + 1}`,
      senderId: messageIndex % 2 === 0 ? buyer.id : seller.id,
      senderName: messageIndex % 2 === 0 ? buyer.name : seller.name,
      body: CHAT_LINES[messageIndex],
      createdAt: new Date(Date.parse(createdAt) + messageIndex * 4 * 60_000).toISOString(),
    }));
    const conversation: SimulationConversation = {
      id: `sim-conversation-${String(index + 1).padStart(4, "0")}`,
      listingId: listing.id,
      catalogId: listing.catalogId,
      buyerId: buyer.id,
      buyerName: buyer.name,
      sellerId: seller.id,
      sellerName: seller.name,
      messages,
      blockedByUserIds: [],
      createdAt,
      updatedAt: messages.at(-1)?.createdAt ?? createdAt,
    };
    conversations.push(conversation);

    const lastMessage = messages.at(-1)!;
    const recipientId = lastMessage.senderId === buyer.id ? seller.id : buyer.id;
    notifications.push({
      id: `sim-notification-message-${index + 1}`,
      recipientId,
      kind: "new_message",
      title: `Nuevo mensaje sobre ${listing.title}`,
      body: lastMessage.body,
      conversationId: conversation.id,
      listingId: listing.id,
      createdAt: lastMessage.createdAt,
      readAt: index % 3 === 0 ? lastMessage.createdAt : null,
    });
  }

  return { conversations, notifications };
}

export function createVitrinaSimulationState(
  catalogGames: readonly SimulationCatalogGame[],
  listingCount = VITRINA_SIMULATION_LISTING_COUNT,
): VitrinaSimulationState {
  if (catalogGames.length === 0) {
    throw new Error("El simulador necesita al menos un juego del catálogo.");
  }
  const users = createUsers();
  const listings = Array.from({ length: listingCount }, (_, index) => {
    const game = catalogGames[index % catalogGames.length];
    const seller = users[(index * 17 + 7) % users.length];
    return buildListing(game, seller, index);
  });
  const { conversations, notifications } = seedConversations(listings, users);
  const updatedAt = "2026-09-14T08:00:00.000Z";
  return {
    schemaVersion: 1,
    seedVersion: VITRINA_SIMULATION_VERSION,
    revision: 1,
    updatedAt,
    users,
    listings,
    conversations,
    notifications,
  };
}

export function isVitrinaSimulationState(value: unknown): value is VitrinaSimulationState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<VitrinaSimulationState>;
  return state.schemaVersion === 1
    && state.seedVersion === VITRINA_SIMULATION_VERSION
    && typeof state.revision === "number"
    && Array.isArray(state.users)
    && Array.isArray(state.listings)
    && Array.isArray(state.conversations)
    && Array.isArray(state.notifications);
}

function revise(state: VitrinaSimulationState, patch: Partial<VitrinaSimulationState>): VitrinaSimulationState {
  return {
    ...state,
    ...patch,
    revision: state.revision + 1,
    updatedAt: nowIso(),
  };
}

function notification(
  state: VitrinaSimulationState,
  input: Omit<SimulationNotification, "id" | "createdAt" | "readAt">,
): SimulationNotification {
  return {
    ...input,
    id: `sim-notification-${state.revision + 1}-${state.notifications.length + 1}`,
    createdAt: nowIso(),
    readAt: null,
  };
}

export function createSimulationListing(
  state: VitrinaSimulationState,
  input: {
    sellerId: string;
    game: SimulationCatalogGame;
    condition: CollectionCondition;
    askingPriceEur: number;
    description: string;
    pickup: boolean;
    shipping: boolean;
    publish: boolean;
  },
): { state: VitrinaSimulationState; listingId?: string; error?: string } {
  const seller = state.users.find((user) => user.id === input.sellerId);
  if (!seller) return { state, error: "Usuario de simulación no encontrado." };
  if (!Number.isFinite(input.askingPriceEur) || input.askingPriceEur <= 0) {
    return { state, error: "Indica un precio válido." };
  }
  if (!input.pickup && !input.shipping) {
    return { state, error: "Selecciona al menos una forma de entrega." };
  }
  const duplicate = state.listings.find((listing) =>
    listing.sellerId === input.sellerId
      && listing.catalogId === input.game.id
      && (listing.status === "active" || listing.status === "draft"),
  );
  if (duplicate) return { state, error: "Este usuario ya tiene un anuncio abierto para ese juego." };

  const timestamp = nowIso();
  const listing: SimulationListing = {
    id: `sim-created-${state.revision + 1}-${state.listings.length + 1}`,
    catalogId: input.game.id,
    catalogHref: input.game.catalogHref,
    title: input.game.title,
    description: input.description.trim() || "Anuncio creado durante la simulación.",
    coverUrl: input.game.coverUrl,
    platformSlug: input.game.platformSlug,
    platformName: input.game.platformName,
    region: input.game.region,
    regionKey: input.game.regionKey,
    regionLabel: input.game.regionLabel,
    regionShortLabel: input.game.regionShortLabel,
    condition: input.condition,
    askingPriceEur: roundMoney(input.askingPriceEur),
    sellerId: seller.id,
    sellerName: seller.name,
    sellerCity: seller.city,
    sellerLocation: seller.location,
    pickup: input.pickup,
    shipping: input.shipping,
    status: input.publish ? "active" : "draft",
    publishedAt: input.publish ? timestamp : null,
    updatedAt: timestamp,
    soldToUserId: null,
    soldToUserName: null,
    sellerConfirmedAt: null,
    buyerConfirmedAt: null,
    recordedSalePriceEur: null,
    searchText: "",
  };
  listing.searchText = listingSearchText(listing);
  const createdNotification = notification(state, {
    recipientId: seller.id,
    kind: "listing_created",
    title: input.publish ? "Anuncio publicado" : "Borrador guardado",
    body: listing.title,
    conversationId: null,
    listingId: listing.id,
  });
  return {
    state: revise(state, {
      listings: [listing, ...state.listings],
      notifications: [createdNotification, ...state.notifications],
    }),
    listingId: listing.id,
  };
}

export function updateSimulationListing(
  state: VitrinaSimulationState,
  input: {
    listingId: string;
    sellerId: string;
    title: string;
    description: string;
    askingPriceEur: number;
    pickup: boolean;
    shipping: boolean;
  },
): { state: VitrinaSimulationState; error?: string } {
  const listing = state.listings.find((entry) => entry.id === input.listingId);
  if (!listing || listing.sellerId !== input.sellerId) return { state, error: "Anuncio no encontrado." };
  if (listing.status !== "active" && listing.status !== "draft") return { state, error: "El anuncio ya está cerrado." };
  if (!input.title.trim()) return { state, error: "El título no puede quedar vacío." };
  if (!Number.isFinite(input.askingPriceEur) || input.askingPriceEur <= 0) return { state, error: "Indica un precio válido." };
  if (!input.pickup && !input.shipping) return { state, error: "Selecciona al menos una forma de entrega." };

  const updatedAt = nowIso();
  const nextListings = state.listings.map((entry) => {
    if (entry.id !== listing.id) return entry;
    const next = {
      ...entry,
      title: input.title.trim(),
      description: input.description.trim(),
      askingPriceEur: roundMoney(input.askingPriceEur),
      pickup: input.pickup,
      shipping: input.shipping,
      updatedAt,
    };
    return { ...next, searchText: listingSearchText(next) };
  });
  const updatedNotification = notification(state, {
    recipientId: input.sellerId,
    kind: "listing_updated",
    title: "Anuncio actualizado",
    body: input.title.trim(),
    conversationId: null,
    listingId: listing.id,
  });
  return {
    state: revise(state, {
      listings: nextListings,
      notifications: [updatedNotification, ...state.notifications],
    }),
  };
}

export function publishSimulationListing(
  state: VitrinaSimulationState,
  listingId: string,
  sellerId: string,
): { state: VitrinaSimulationState; error?: string } {
  const listing = state.listings.find((entry) => entry.id === listingId);
  if (!listing || listing.sellerId !== sellerId) return { state, error: "Anuncio no encontrado." };
  if (listing.status !== "draft") return { state, error: "Solo se pueden publicar borradores." };
  const timestamp = nowIso();
  return {
    state: revise(state, {
      listings: state.listings.map((entry) => entry.id === listingId
        ? { ...entry, status: "active", publishedAt: timestamp, updatedAt: timestamp }
        : entry),
    }),
  };
}

export function removeSimulationListing(
  state: VitrinaSimulationState,
  listingId: string,
  sellerId: string,
): { state: VitrinaSimulationState; removed: boolean; error?: string } {
  const listing = state.listings.find((entry) => entry.id === listingId);
  if (!listing || listing.sellerId !== sellerId) return { state, removed: false, error: "Anuncio no encontrado." };
  if (listing.status !== "draft" && listing.status !== "active") {
    return { state, removed: false, error: "El anuncio ya está cerrado." };
  }
  if (listing.status === "draft") {
    return {
      state: revise(state, { listings: state.listings.filter((entry) => entry.id !== listingId) }),
      removed: true,
    };
  }
  const timestamp = nowIso();
  return {
    state: revise(state, {
      listings: state.listings.map((entry) => entry.id === listingId
        ? { ...entry, status: "cancelled", updatedAt: timestamp }
        : entry),
    }),
    removed: false,
  };
}

export function startSimulationConversation(
  state: VitrinaSimulationState,
  listingId: string,
  buyerId: string,
): { state: VitrinaSimulationState; conversationId?: string; error?: string } {
  const listing = state.listings.find((entry) => entry.id === listingId);
  const buyer = state.users.find((entry) => entry.id === buyerId);
  if (!listing || listing.status !== "active") return { state, error: "Este anuncio no está disponible." };
  if (!buyer) return { state, error: "Comprador de simulación no encontrado." };
  if (listing.sellerId === buyerId) return { state, error: "No puedes contactar contigo mismo." };
  const existing = state.conversations.find((conversation) =>
    conversation.listingId === listingId && conversation.buyerId === buyerId,
  );
  if (existing) return { state, conversationId: existing.id };
  const timestamp = nowIso();
  const conversation: SimulationConversation = {
    id: `sim-conversation-created-${state.revision + 1}-${state.conversations.length + 1}`,
    listingId,
    catalogId: listing.catalogId,
    buyerId: buyer.id,
    buyerName: buyer.name,
    sellerId: listing.sellerId,
    sellerName: listing.sellerName,
    messages: [],
    blockedByUserIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return {
    state: revise(state, { conversations: [conversation, ...state.conversations] }),
    conversationId: conversation.id,
  };
}

export function addSimulationMessage(
  state: VitrinaSimulationState,
  conversationId: string,
  senderId: string,
  body: string,
): { state: VitrinaSimulationState; error?: string } {
  const conversation = state.conversations.find((entry) => entry.id === conversationId);
  const sender = state.users.find((entry) => entry.id === senderId);
  const messageBody = body.trim();
  if (!conversation || !sender) return { state, error: "Conversación no encontrada." };
  if (conversation.buyerId !== senderId && conversation.sellerId !== senderId) return { state, error: "No participas en esta conversación." };
  if (conversation.blockedByUserIds.length > 0) return { state, error: "La conversación está bloqueada." };
  if (!messageBody) return { state, error: "Escribe un mensaje." };
  const timestamp = nowIso();
  const message: SimulationMessage = {
    id: `sim-message-created-${state.revision + 1}-${conversation.messages.length + 1}`,
    senderId,
    senderName: sender.name,
    body: messageBody.slice(0, 2_000),
    createdAt: timestamp,
  };
  const nextConversations = state.conversations.map((entry) => entry.id === conversationId
    ? { ...entry, messages: [...entry.messages, message], updatedAt: timestamp }
    : entry);
  const recipientId = senderId === conversation.buyerId ? conversation.sellerId : conversation.buyerId;
  const listing = state.listings.find((entry) => entry.id === conversation.listingId);
  const newNotification = notification(state, {
    recipientId,
    kind: "new_message",
    title: `Nuevo mensaje sobre ${listing?.title ?? "un anuncio"}`,
    body: message.body,
    conversationId,
    listingId: conversation.listingId,
  });
  return {
    state: revise(state, {
      conversations: nextConversations,
      notifications: [newNotification, ...state.notifications],
    }),
  };
}

export function blockSimulationConversation(
  state: VitrinaSimulationState,
  conversationId: string,
  blockerId: string,
): { state: VitrinaSimulationState; error?: string } {
  const conversation = state.conversations.find((entry) => entry.id === conversationId);
  if (!conversation) return { state, error: "Conversación no encontrada." };
  if (conversation.buyerId !== blockerId && conversation.sellerId !== blockerId) return { state, error: "No participas en esta conversación." };
  if (conversation.blockedByUserIds.includes(blockerId)) return { state };
  return {
    state: revise(state, {
      conversations: state.conversations.map((entry) => entry.id === conversationId
        ? { ...entry, blockedByUserIds: [...entry.blockedByUserIds, blockerId] }
        : entry),
    }),
  };
}

export function markSimulationSale(
  state: VitrinaSimulationState,
  input: { listingId: string; sellerId: string; buyerId: string; priceEur: number },
): { state: VitrinaSimulationState; error?: string } {
  const listing = state.listings.find((entry) => entry.id === input.listingId);
  const buyer = state.users.find((entry) => entry.id === input.buyerId);
  if (!listing || listing.sellerId !== input.sellerId) return { state, error: "Anuncio no encontrado." };
  if (listing.status !== "active") return { state, error: "El anuncio ya no está activo." };
  if (!buyer || buyer.id === input.sellerId) return { state, error: "Comprador no válido." };
  const conversation = state.conversations.find((entry) =>
    entry.listingId === listing.id && entry.buyerId === buyer.id,
  );
  if (!conversation) return { state, error: "El acuerdo debe estar vinculado a un chat." };
  if (!Number.isFinite(input.priceEur) || input.priceEur <= 0) return { state, error: "Indica un precio final válido." };
  const timestamp = nowIso();
  const nextListing: SimulationListing = {
    ...listing,
    status: "sold",
    soldToUserId: buyer.id,
    soldToUserName: buyer.name,
    sellerConfirmedAt: timestamp,
    buyerConfirmedAt: null,
    recordedSalePriceEur: roundMoney(input.priceEur),
    updatedAt: timestamp,
  };
  const saleNotification = notification(state, {
    recipientId: buyer.id,
    kind: "sale_marked",
    title: "Venta acordada",
    body: `${listing.title} · confirma cuando lo recibas`,
    conversationId: conversation.id,
    listingId: listing.id,
  });
  return {
    state: revise(state, {
      listings: state.listings.map((entry) => entry.id === listing.id ? nextListing : entry),
      notifications: [saleNotification, ...state.notifications],
    }),
  };
}

export function confirmSimulationReceipt(
  state: VitrinaSimulationState,
  listingId: string,
  buyerId: string,
): { state: VitrinaSimulationState; recorded: boolean; error?: string } {
  const listing = state.listings.find((entry) => entry.id === listingId);
  if (!listing || listing.status !== "sold" || listing.soldToUserId !== buyerId) {
    return { state, recorded: false, error: "Venta no encontrada." };
  }
  if (listing.buyerConfirmedAt) return { state, recorded: false };
  const timestamp = nowIso();
  const conversation = state.conversations.find((entry) =>
    entry.listingId === listing.id && entry.buyerId === buyerId,
  );
  const completeNotification = notification(state, {
    recipientId: listing.sellerId,
    kind: "sale_completed",
    title: "Venta completada",
    body: `${listing.title} ya ha sido recibido`,
    conversationId: conversation?.id ?? null,
    listingId: listing.id,
  });
  return {
    state: revise(state, {
      listings: state.listings.map((entry) => entry.id === listing.id
        ? { ...entry, buyerConfirmedAt: timestamp, updatedAt: timestamp }
        : entry),
      notifications: [completeNotification, ...state.notifications],
    }),
    recorded: true,
  };
}

export function markSimulationNotificationsRead(
  state: VitrinaSimulationState,
  userId: string,
  notificationIds?: readonly string[],
): VitrinaSimulationState {
  const selected = notificationIds ? new Set(notificationIds) : null;
  const timestamp = nowIso();
  let changed = false;
  const notifications = state.notifications.map((entry) => {
    if (entry.recipientId !== userId || entry.readAt || (selected && !selected.has(entry.id))) return entry;
    changed = true;
    return { ...entry, readAt: timestamp };
  });
  return changed ? revise(state, { notifications }) : state;
}

export function simulationListingDistanceKm(
  listing: SimulationListing,
  buyerLocation: OfferCoordinates | null,
): number | null {
  if (!listing.sellerLocation || !buyerLocation) return null;
  return offerDistanceKm(buyerLocation, listing.sellerLocation);
}

function listingTimestamp(listing: SimulationListing): number {
  const parsed = Date.parse(listing.publishedAt ?? listing.updatedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function filterSimulationListings(
  listings: readonly SimulationListing[],
  filters: SimulationListingFilters,
  buyerLocation: OfferCoordinates | null,
): SimulationListing[] {
  const query = normalizeSimulationSearch(filters.query);
  const city = normalizeSimulationSearch(filters.city);
  const filtered = listings.filter((listing) => {
    if (listing.status !== "active") return false;
    if (query && !listing.searchText.includes(query)) return false;
    if (filters.platform !== "all" && listing.platformSlug !== filters.platform) return false;
    if (filters.region !== "all" && listing.regionKey !== filters.region) return false;
    if (filters.condition !== "all" && listing.condition !== filters.condition) return false;
    if (filters.delivery === "shipping" && !listing.shipping) return false;
    if (filters.delivery === "pickup" && !listing.pickup) return false;
    if (city && !normalizeSimulationSearch(listing.sellerCity).includes(city)) return false;
    if (filters.minPrice != null && listing.askingPriceEur < filters.minPrice) return false;
    if (filters.maxPrice != null && listing.askingPriceEur > filters.maxPrice) return false;
    if (filters.radiusKm != null) {
      const distance = simulationListingDistanceKm(listing, buyerLocation);
      if (distance == null || distance > filters.radiusKm) return false;
    }
    return true;
  });

  return [...filtered].sort((left, right) => {
    if (filters.sort === "price-asc") return left.askingPriceEur - right.askingPriceEur || listingTimestamp(right) - listingTimestamp(left);
    if (filters.sort === "price-desc") return right.askingPriceEur - left.askingPriceEur || listingTimestamp(right) - listingTimestamp(left);
    if (filters.sort === "distance") {
      const leftDistance = simulationListingDistanceKm(left, buyerLocation) ?? Number.POSITIVE_INFINITY;
      const rightDistance = simulationListingDistanceKm(right, buyerLocation) ?? Number.POSITIVE_INFINITY;
      return leftDistance - rightDistance || listingTimestamp(right) - listingTimestamp(left);
    }
    return listingTimestamp(right) - listingTimestamp(left) || left.title.localeCompare(right.title, "es");
  });
}

export function simulationCoverage(listings: readonly SimulationListing[]): {
  platforms: number;
  regions: number;
  activeListings: number;
} {
  const active = listings.filter((listing) => listing.status === "active");
  return {
    platforms: new Set(active.map((listing) => listing.platformSlug)).size,
    regions: new Set(active.map((listing) => listing.regionKey)).size,
    activeListings: active.length,
  };
}
