import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SIMULATION_FILTERS,
  VITRINA_SIMULATION_VERSION,
  addSimulationMessage,
  blockSimulationConversation,
  confirmSimulationReceipt,
  createSimulationListing,
  createVitrinaSimulationState,
  filterSimulationListings,
  isVitrinaSimulationState,
  markSimulationNotificationsRead,
  markSimulationSale,
  publishSimulationListing,
  removeSimulationListing,
  simulationCoverage,
  startSimulationConversation,
  updateSimulationListing,
  type SimulationCatalogGame,
} from "./vitrina-simulation";

const GAMES: SimulationCatalogGame[] = [
  {
    id: "sim-game-ps5-es",
    title: "Juego Solar",
    catalogHref: "/catalogo/juego-solar",
    coverUrl: "/covers/solar.jpg",
    platformSlug: "ps5",
    platformName: "PS5",
    region: "PAL España",
    regionKey: "flag:ES",
    regionLabel: "PAL España",
    regionShortLabel: "ES",
    referencePriceEur: 35,
  },
  {
    id: "sim-game-switch-jp",
    title: "Juego Lunar",
    catalogHref: "/catalogo/juego-lunar",
    coverUrl: "/covers/lunar.jpg",
    platformSlug: "switch",
    platformName: "Nintendo Switch",
    region: "NTSC-J Japón",
    regionKey: "flag:JP",
    regionLabel: "NTSC-J Japón",
    regionShortLabel: "JP",
    referencePriceEur: 42,
  },
  {
    id: "sim-game-snes-us",
    title: "Juego Cometa",
    catalogHref: "/catalogo/juego-cometa",
    coverUrl: "/covers/cometa.jpg",
    platformSlug: "snes",
    platformName: "SNES",
    region: "NTSC USA",
    regionKey: "flag:US",
    regionLabel: "NTSC USA",
    regionShortLabel: "US",
    referencePriceEur: 70,
  },
  {
    id: "sim-game-dreamcast-eu",
    title: "Juego Órbita",
    catalogHref: "/catalogo/juego-orbita",
    coverUrl: "/covers/orbita.jpg",
    platformSlug: "dreamcast",
    platformName: "Dreamcast",
    region: "PAL Europa",
    regionKey: "flag:EU",
    regionLabel: "PAL Europa",
    regionShortLabel: "EU",
    referencePriceEur: null,
  },
];

test("builds a deterministic, valid large marketplace seed", () => {
  const first = createVitrinaSimulationState(GAMES, 240);
  const second = createVitrinaSimulationState(GAMES, 240);

  assert.equal(first.seedVersion, VITRINA_SIMULATION_VERSION);
  assert.equal(first.users.length, 80);
  assert.equal(new Set(first.users.map((user) => user.name)).size, 80);
  assert.equal(first.listings.length, 240);
  assert.equal(first.conversations.length, 180);
  assert.deepEqual(first, second);
  assert.equal(isVitrinaSimulationState(first), true);
  assert.deepEqual(simulationCoverage(first.listings), {
    platforms: 4,
    regions: 4,
    activeListings: first.listings.filter((listing) => listing.status === "active").length,
  });
});

test("filters by text, platform, canonical region and distance", () => {
  const state = createVitrinaSimulationState(GAMES, 240);
  const user = state.users[0];

  const textMatches = filterSimulationListings(state.listings, {
    ...DEFAULT_SIMULATION_FILTERS,
    query: "orbita dreamcast",
  }, user.location);
  assert.ok(textMatches.length > 0);
  assert.ok(textMatches.every((listing) => listing.title === "Juego Órbita"));

  const regional = filterSimulationListings(state.listings, {
    ...DEFAULT_SIMULATION_FILTERS,
    platform: "switch",
    region: "flag:JP",
  }, user.location);
  assert.ok(regional.length > 0);
  assert.ok(regional.every((listing) =>
    listing.platformSlug === "switch" && listing.regionKey === "flag:JP",
  ));

  const near = filterSimulationListings(state.listings, {
    ...DEFAULT_SIMULATION_FILTERS,
    radiusKm: 25,
    sort: "distance",
  }, user.location);
  assert.ok(near.length > 0);
  assert.ok(near.every((listing) => listing.sellerLocation));
});

test("creates, edits, publishes, retires and deletes simulated listings", () => {
  let state = createVitrinaSimulationState(GAMES, 1);
  const seller = state.users[0];
  const game = GAMES[1];

  const created = createSimulationListing(state, {
    sellerId: seller.id,
    game,
    condition: "complete",
    askingPriceEur: 49.95,
    description: "Completo y bien conservado.",
    pickup: true,
    shipping: true,
    publish: false,
  });
  assert.equal(created.error, undefined);
  assert.ok(created.listingId);
  state = created.state;
  let listing = state.listings.find((entry) => entry.id === created.listingId);
  assert.equal(listing?.status, "draft");
  assert.equal(listing?.coverUrl, game.coverUrl);

  const updated = updateSimulationListing(state, {
    listingId: listing!.id,
    sellerId: seller.id,
    title: "Juego Lunar impecable",
    description: "Descripción actualizada.",
    askingPriceEur: 45,
    pickup: false,
    shipping: true,
  });
  assert.equal(updated.error, undefined);
  state = updated.state;
  listing = state.listings.find((entry) => entry.id === created.listingId);
  assert.equal(listing?.title, "Juego Lunar impecable");
  assert.equal(listing?.askingPriceEur, 45);

  const published = publishSimulationListing(state, listing!.id, seller.id);
  assert.equal(published.error, undefined);
  state = published.state;
  listing = state.listings.find((entry) => entry.id === created.listingId);
  assert.equal(listing?.status, "active");
  assert.ok(listing?.publishedAt);

  const retired = removeSimulationListing(state, listing!.id, seller.id);
  assert.equal(retired.error, undefined);
  assert.equal(retired.removed, false);
  assert.equal(
    retired.state.listings.find((entry) => entry.id === listing!.id)?.status,
    "cancelled",
  );

  const draft = createSimulationListing(retired.state, {
    sellerId: seller.id,
    game: GAMES[2],
    condition: "sealed",
    askingPriceEur: 99,
    description: "",
    pickup: true,
    shipping: false,
    publish: false,
  });
  assert.ok(draft.listingId);
  const removed = removeSimulationListing(draft.state, draft.listingId!, seller.id);
  assert.equal(removed.removed, true);
  assert.equal(removed.state.listings.some((entry) => entry.id === draft.listingId), false);
});

test("runs chat, agreement, receipt and notification flow without real storage", () => {
  let state = createVitrinaSimulationState(GAMES, 80);
  const listing = state.listings.find((entry) => entry.status === "active")!;
  const seller = state.users.find((entry) => entry.id === listing.sellerId)!;
  const buyer = state.users.find((entry) => entry.id !== seller.id)!;

  const ownChat = startSimulationConversation(state, listing.id, seller.id);
  assert.equal(ownChat.error, "No puedes contactar contigo mismo.");

  const started = startSimulationConversation(state, listing.id, buyer.id);
  assert.equal(started.error, undefined);
  assert.ok(started.conversationId);
  state = started.state;

  const repeated = startSimulationConversation(state, listing.id, buyer.id);
  assert.equal(repeated.conversationId, started.conversationId);
  assert.equal(repeated.state, state);

  const sent = addSimulationMessage(state, started.conversationId!, buyer.id, "¿Aceptas 30 €?");
  assert.equal(sent.error, undefined);
  state = sent.state;
  const messageNotification = state.notifications.find((item) =>
    item.recipientId === seller.id
      && item.conversationId === started.conversationId
      && !item.readAt,
  );
  assert.ok(messageNotification);

  const read = markSimulationNotificationsRead(state, seller.id, [messageNotification!.id]);
  assert.ok(read.notifications.find((item) => item.id === messageNotification!.id)?.readAt);
  state = read;

  const sale = markSimulationSale(state, {
    listingId: listing.id,
    sellerId: seller.id,
    buyerId: buyer.id,
    priceEur: 30,
  });
  assert.equal(sale.error, undefined);
  state = sale.state;
  assert.equal(state.listings.find((entry) => entry.id === listing.id)?.status, "sold");

  const receipt = confirmSimulationReceipt(state, listing.id, buyer.id);
  assert.equal(receipt.error, undefined);
  assert.equal(receipt.recorded, true);
  state = receipt.state;
  assert.ok(state.listings.find((entry) => entry.id === listing.id)?.buyerConfirmedAt);
  assert.ok(state.notifications.some((item) =>
    item.recipientId === seller.id && item.kind === "sale_completed",
  ));

  const blocked = blockSimulationConversation(state, started.conversationId!, seller.id);
  assert.equal(blocked.error, undefined);
  const blockedMessage = addSimulationMessage(
    blocked.state,
    started.conversationId!,
    buyer.id,
    "Este mensaje no debe entrar.",
  );
  assert.equal(blockedMessage.error, "La conversación está bloqueada.");
});
