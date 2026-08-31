import { randomUUID } from "crypto";
import {
  mutateCommunicationState,
  readCommunicationState,
  type CommunicationOutboxEvent,
  type MarketplaceCommunicationState,
  type StoredChatMessage,
  type StoredMarketplaceConversation,
} from "./communication-state-store";
import { readMarketplaceDocument } from "./marketplace-document-store";
import type {
  ChatMessage,
  MarketplaceBlock,
  MarketplaceCommunicationSummary,
  MarketplaceConversation,
  MarketplaceNotification,
  MarketplaceNotificationKind,
} from "./marketplace-types";
import { getListing } from "./listings";

const LEGACY_CONVERSATIONS_DOCUMENT = "conversations.json";
const LEGACY_BLOCKS_DOCUMENT = "blocks.json";

function toStoredConversation(
  conversation: MarketplaceConversation,
): StoredMarketplaceConversation {
  return {
    id: conversation.id,
    listingId: conversation.listingId,
    catalogId: conversation.catalogId,
    buyerId: conversation.buyerId,
    buyerName: conversation.buyerName,
    sellerId: conversation.sellerId,
    sellerName: conversation.sellerName,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

function toPublicMessage(message: StoredChatMessage): ChatMessage {
  return {
    id: message.id,
    senderId: message.senderId,
    senderName: message.senderName,
    body: message.body,
    createdAt: message.createdAt,
    status: message.status,
  };
}

function messageIsReadByRecipient(
  state: MarketplaceCommunicationState,
  conversation: StoredMarketplaceConversation,
  message: StoredChatMessage,
): boolean {
  const recipientId =
    message.senderId === conversation.buyerId
      ? conversation.sellerId
      : conversation.buyerId;
  const participant = state.participants.find(
    (entry) => entry.conversationId === conversation.id && entry.userId === recipientId,
  );
  if (!participant?.lastReadMessageId) return false;
  const ordered = state.messages
    .filter((entry) => entry.conversationId === conversation.id)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const messageIndex = ordered.findIndex((entry) => entry.id === message.id);
  const lastReadIndex = ordered.findIndex(
    (entry) => entry.id === participant.lastReadMessageId,
  );
  if (messageIndex >= 0 && lastReadIndex >= 0) return messageIndex <= lastReadIndex;
  return Boolean(participant.lastReadAt && message.createdAt <= participant.lastReadAt);
}

function conversationMessages(
  state: MarketplaceCommunicationState,
  conversation: StoredMarketplaceConversation,
): ChatMessage[] {
  return state.messages
    .filter((message) => message.conversationId === conversation.id)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map((message) => ({
      ...toPublicMessage(message),
      status: messageIsReadByRecipient(state, conversation, message) ? "read" : "delivered",
    }));
}

function hydrateConversation(
  state: MarketplaceCommunicationState,
  conversation: StoredMarketplaceConversation,
): MarketplaceConversation {
  const blockedByUserIds = state.blocks
    .filter((block) => block.conversationId === conversation.id)
    .map((block) => block.blockerId);
  return {
    ...conversation,
    messages: conversationMessages(state, conversation),
    ...(blockedByUserIds.length > 0 ? { blockedByUserIds } : {}),
  };
}

function isBlockedBetweenState(
  state: MarketplaceCommunicationState,
  firstUserId: string,
  secondUserId: string,
): boolean {
  return state.blocks.some(
    (block) =>
      (block.blockerId === firstUserId && block.blockedId === secondUserId) ||
      (block.blockerId === secondUserId && block.blockedId === firstUserId),
  );
}

function unreadMessagesForConversation(
  state: MarketplaceCommunicationState,
  conversation: StoredMarketplaceConversation,
  userId: string,
): StoredChatMessage[] {
  const participant = state.participants.find(
    (entry) => entry.conversationId === conversation.id && entry.userId === userId,
  );
  const ordered = state.messages
    .filter((message) => message.conversationId === conversation.id)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const lastReadIndex = participant?.lastReadMessageId
    ? ordered.findIndex((message) => message.id === participant.lastReadMessageId)
    : -1;
  return ordered.filter((message, index) => {
    if (message.senderId === userId) return false;
    if (lastReadIndex >= 0) return index > lastReadIndex;
    if (!participant?.lastReadMessageId) return true;
    return !participant.lastReadAt || message.createdAt > participant.lastReadAt;
  });
}

async function ensureCommunicationsInitialized(): Promise<void> {
  if ((await readCommunicationState()).initializedAt) return;

  const [legacyConversations, legacyBlocks] = await Promise.all([
    readMarketplaceDocument<MarketplaceConversation>(LEGACY_CONVERSATIONS_DOCUMENT),
    readMarketplaceDocument<MarketplaceBlock>(LEGACY_BLOCKS_DOCUMENT),
  ]);

  await mutateCommunicationState((state) => {
    if (state.initializedAt) return { next: state, result: undefined, changed: false };

    const now = new Date().toISOString();
    const conversations = legacyConversations.map(toStoredConversation);
    const messages: StoredChatMessage[] = [];
    const participants: MarketplaceCommunicationState["participants"] = [];

    for (const conversation of legacyConversations) {
      const storedMessages = (conversation.messages ?? []).map((message) => ({
        ...message,
        conversationId: conversation.id,
        status: "read" as const,
      }));
      messages.push(...storedMessages);
      const lastMessage = storedMessages.at(-1) ?? null;
      for (const userId of [conversation.buyerId, conversation.sellerId]) {
        participants.push({
          conversationId: conversation.id,
          userId,
          lastReadMessageId: lastMessage?.id ?? null,
          lastReadAt: lastMessage?.createdAt ?? conversation.updatedAt,
        });
      }
    }

    return {
      next: {
        schemaVersion: 1,
        initializedAt: now,
        migratedFromLegacyAt:
          legacyConversations.length > 0 || legacyBlocks.length > 0 ? now : null,
        conversations,
        messages,
        participants,
        blocks: legacyBlocks,
        notifications: [],
        outbox: [],
      },
      result: undefined,
    };
  });
}

async function readInitializedState(): Promise<MarketplaceCommunicationState> {
  await ensureCommunicationsInitialized();
  return readCommunicationState();
}

async function mutateInitializedState<R>(
  mutation: Parameters<typeof mutateCommunicationState<R>>[0],
): Promise<R> {
  await ensureCommunicationsInitialized();
  return mutateCommunicationState(mutation);
}

export async function isUserBlockedBetween(firstUserId: string, secondUserId: string): Promise<boolean> {
  return isBlockedBetweenState(await readInitializedState(), firstUserId, secondUserId);
}

export async function blockConversation(input: {
  conversationId: string;
  blockerId: string;
}): Promise<{ ok: true } | { error: string }> {
  return mutateInitializedState<{ ok: true } | { error: string }>((state) => {
    const conversation = state.conversations.find(
      (stored) => stored.id === input.conversationId,
    );
    if (!conversation) {
      return { next: state, result: { error: "Conversación no encontrada." } as const, changed: false };
    }
    if (conversation.buyerId !== input.blockerId && conversation.sellerId !== input.blockerId) {
      return { next: state, result: { error: "No autorizado." } as const, changed: false };
    }

    const blockedId =
      conversation.buyerId === input.blockerId
        ? conversation.sellerId
        : conversation.buyerId;
    if (
      state.blocks.some(
        (block) => block.blockerId === input.blockerId && block.blockedId === blockedId,
      )
    ) {
      return { next: state, result: { ok: true } as const, changed: false };
    }

    state.blocks.push({
      id: randomUUID(),
      blockerId: input.blockerId,
      blockedId,
      conversationId: input.conversationId,
      createdAt: new Date().toISOString(),
    });
    conversation.updatedAt = new Date().toISOString();
    return { next: state, result: { ok: true } as const };
  });
}

export async function getConversation(id: string): Promise<MarketplaceConversation | undefined> {
  const state = await readInitializedState();
  const conversation = state.conversations.find((stored) => stored.id === id);
  return conversation ? hydrateConversation(state, conversation) : undefined;
}

export async function getConversationWithUnread(
  id: string,
  userId: string,
): Promise<{ conversation: MarketplaceConversation; unreadCount: number } | undefined> {
  const state = await readInitializedState();
  const conversation = state.conversations.find((stored) => stored.id === id);
  if (!conversation) return undefined;
  return {
    conversation: hydrateConversation(state, conversation),
    unreadCount: unreadMessagesForConversation(state, conversation, userId).length,
  };
}

export async function findConversation(
  listingId: string,
  buyerId: string,
): Promise<MarketplaceConversation | undefined> {
  const state = await readInitializedState();
  const conversation = state.conversations.find(
    (stored) => stored.listingId === listingId && stored.buyerId === buyerId,
  );
  return conversation ? hydrateConversation(state, conversation) : undefined;
}

export async function getUserConversations(userId: string): Promise<MarketplaceConversation[]> {
  const state = await readInitializedState();
  return state.conversations
    .filter((conversation) => conversation.buyerId === userId || conversation.sellerId === userId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((conversation) => hydrateConversation(state, conversation));
}

export async function getUserConversationsWithUnread(userId: string): Promise<Array<{
  conversation: MarketplaceConversation;
  unreadCount: number;
}>> {
  const state = await readInitializedState();
  return state.conversations
    .filter((conversation) => conversation.buyerId === userId || conversation.sellerId === userId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((conversation) => ({
      conversation: hydrateConversation(state, conversation),
      unreadCount: unreadMessagesForConversation(state, conversation, userId).length,
    }));
}

export async function startConversation(input: {
  listingId: string;
  buyerId: string;
  buyerName: string;
}): Promise<MarketplaceConversation | { error: string }> {
  const listing = await getListing(input.listingId);
  if (!listing || listing.status !== "active") {
    return { error: "Este anuncio no está disponible." };
  }
  if (listing.sellerId === input.buyerId) {
    return { error: "No puedes chatear contigo mismo." };
  }

  const now = new Date().toISOString();
  const storedConversation: StoredMarketplaceConversation = {
    id: randomUUID(),
    listingId: input.listingId,
    catalogId: listing.catalogId,
    buyerId: input.buyerId,
    buyerName: input.buyerName,
    sellerId: listing.sellerId,
    sellerName: listing.sellerName,
    createdAt: now,
    updatedAt: now,
  };

  return mutateInitializedState<MarketplaceConversation | { error: string }>((state) => {
    if (isBlockedBetweenState(state, listing.sellerId, input.buyerId)) {
      return {
        next: state,
        result: { error: "No se puede iniciar chat con este usuario." },
        changed: false,
      };
    }
    const existing = state.conversations.find(
      (conversation) =>
        conversation.listingId === input.listingId && conversation.buyerId === input.buyerId,
    );
    if (existing) {
      return { next: state, result: hydrateConversation(state, existing), changed: false };
    }

    state.conversations.push(storedConversation);
    state.participants.push(
      {
        conversationId: storedConversation.id,
        userId: storedConversation.buyerId,
        lastReadMessageId: null,
        lastReadAt: now,
      },
      {
        conversationId: storedConversation.id,
        userId: storedConversation.sellerId,
        lastReadMessageId: null,
        lastReadAt: now,
      },
    );
    return { next: state, result: hydrateConversation(state, storedConversation) };
  });
}

function normalizedClientMutationId(value: string | undefined): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized || normalized.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(normalized)) {
    return null;
  }
  return normalized;
}

export async function addMessage(input: {
  conversationId: string;
  senderId: string;
  senderName: string;
  body: string;
  clientMutationId?: string;
}): Promise<ChatMessage | { error: string }> {
  const body = input.body.trim();
  if (!body) return { error: "Mensaje vacío." };
  if (body.length > 2_000) return { error: "El mensaje no puede superar 2.000 caracteres." };

  const now = new Date().toISOString();
  const messageId = randomUUID();
  const eventId = randomUUID();
  const notificationId = randomUUID();
  const clientMutationId = normalizedClientMutationId(input.clientMutationId);
  const eventKey = clientMutationId
    ? `message:${input.conversationId}:${input.senderId}:${clientMutationId}`
    : `message:${messageId}`;

  return mutateInitializedState<ChatMessage | { error: string }>((state) => {
    const existingEvent = state.outbox.find((event) => event.eventKey === eventKey);
    if (existingEvent) {
      const existingMessage = state.messages.find(
        (message) => message.id === existingEvent.entityId,
      );
      if (existingMessage) {
        return { next: state, result: toPublicMessage(existingMessage), changed: false };
      }
    }

    const conversation = state.conversations.find(
      (stored) => stored.id === input.conversationId,
    );
    if (!conversation) {
      return { next: state, result: { error: "Conversación no encontrada." }, changed: false };
    }
    if (conversation.buyerId !== input.senderId && conversation.sellerId !== input.senderId) {
      return { next: state, result: { error: "No autorizado." }, changed: false };
    }
    if (isBlockedBetweenState(state, conversation.buyerId, conversation.sellerId)) {
      return { next: state, result: { error: "Esta conversación está bloqueada." }, changed: false };
    }

    const recipientId =
      conversation.buyerId === input.senderId
        ? conversation.sellerId
        : conversation.buyerId;
    const message: StoredChatMessage = {
      id: messageId,
      conversationId: input.conversationId,
      senderId: input.senderId,
      senderName: input.senderName,
      body,
      createdAt: now,
      status: "delivered",
    };
    const notification: MarketplaceNotification = {
      id: notificationId,
      recipientId,
      kind: "new_message",
      title: `Nuevo mensaje de ${input.senderName}`,
      body: body.length > 160 ? `${body.slice(0, 157)}...` : body,
      href: `/chat/${conversation.id}`,
      eventKey,
      actorId: input.senderId,
      conversationId: conversation.id,
      listingId: conversation.listingId,
      catalogId: conversation.catalogId,
      createdAt: now,
      readAt: null,
    };
    const event: CommunicationOutboxEvent = {
      id: eventId,
      eventKey,
      type: "message.created",
      recipientId,
      entityId: message.id,
      conversationId: conversation.id,
      listingId: conversation.listingId,
      occurredAt: now,
      projectedAt: now,
    };

    state.messages.push(message);
    state.notifications.push(notification);
    state.outbox.push(event);
    conversation.updatedAt = now;
    return { next: state, result: toPublicMessage(message) };
  });
}

export async function markConversationRead(input: {
  conversationId: string;
  userId: string;
}): Promise<{ ok: true; readCount: number } | { error: string }> {
  return mutateInitializedState<{ ok: true; readCount: number } | { error: string }>((state) => {
    const conversation = state.conversations.find(
      (stored) => stored.id === input.conversationId,
    );
    if (!conversation) {
      return { next: state, result: { error: "Conversación no encontrada." } as const, changed: false };
    }
    if (conversation.buyerId !== input.userId && conversation.sellerId !== input.userId) {
      return { next: state, result: { error: "No autorizado." } as const, changed: false };
    }

    const unread = unreadMessagesForConversation(state, conversation, input.userId);
    const unreadNotifications = state.notifications.filter(
      (notification) =>
        notification.recipientId === input.userId &&
        notification.conversationId === input.conversationId &&
        notification.kind === "new_message" &&
        !notification.readAt,
    );
    if (unread.length === 0 && unreadNotifications.length === 0) {
      return { next: state, result: { ok: true, readCount: 0 } as const, changed: false };
    }

    const latest = state.messages
      .filter((message) => message.conversationId === input.conversationId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    const participant = state.participants.find(
      (entry) => entry.conversationId === input.conversationId && entry.userId === input.userId,
    );
    if (participant) {
      participant.lastReadMessageId = latest?.id ?? participant.lastReadMessageId;
      participant.lastReadAt = latest?.createdAt ?? participant.lastReadAt;
    } else {
      state.participants.push({
        conversationId: input.conversationId,
        userId: input.userId,
        lastReadMessageId: latest?.id ?? null,
        lastReadAt: latest?.createdAt ?? new Date().toISOString(),
      });
    }
    const readAt = new Date().toISOString();
    for (const notification of unreadNotifications) notification.readAt = readAt;
    return { next: state, result: { ok: true, readCount: unread.length } as const };
  });
}

type ListingNotificationInput = {
  eventKey: string;
  eventType: CommunicationOutboxEvent["type"];
  kind: Exclude<MarketplaceNotificationKind, "new_message">;
  recipientId: string;
  title: string;
  body?: string | null;
  href: string;
  listingId: string;
  catalogId: string;
  actorId?: string | null;
  conversationId?: string | null;
};

async function recordListingNotification(input: ListingNotificationInput): Promise<void> {
  const now = new Date().toISOString();
  await mutateInitializedState((state) => {
    if (state.outbox.some((event) => event.eventKey === input.eventKey)) {
      return { next: state, result: undefined, changed: false };
    }
    state.notifications.push({
      id: randomUUID(),
      recipientId: input.recipientId,
      kind: input.kind,
      title: input.title,
      body: input.body?.trim() || null,
      href: input.href,
      eventKey: input.eventKey,
      actorId: input.actorId ?? null,
      conversationId: input.conversationId ?? null,
      listingId: input.listingId,
      catalogId: input.catalogId,
      createdAt: now,
      readAt: null,
    });
    state.outbox.push({
      id: randomUUID(),
      eventKey: input.eventKey,
      type: input.eventType,
      recipientId: input.recipientId,
      entityId: input.listingId,
      conversationId: input.conversationId ?? null,
      listingId: input.listingId,
      occurredAt: now,
      projectedAt: now,
    });
    return { next: state, result: undefined };
  });
}

export async function notifyListingReview(input: {
  listingId: string;
  catalogId: string;
  sellerId: string;
  title: string;
  action: "approve" | "reject";
  note?: string | null;
}): Promise<void> {
  const approved = input.action === "approve";
  return recordListingNotification({
    eventKey: `listing-review:${input.listingId}:${input.action}`,
    eventType: approved ? "listing.approved" : "listing.rejected",
    kind: approved ? "listing_approved" : "listing_rejected",
    recipientId: input.sellerId,
    title: approved ? "Tu anuncio ya está publicado" : "Tu anuncio necesita cambios",
    body: input.note || input.title,
    href: "/mis-anuncios",
    listingId: input.listingId,
    catalogId: input.catalogId,
  });
}

export async function notifySaleMarked(input: {
  listingId: string;
  catalogId: string;
  buyerId: string;
  sellerId: string;
  title: string;
  conversationId: string;
}): Promise<void> {
  return recordListingNotification({
    eventKey: `sale-marked:${input.listingId}`,
    eventType: "sale.marked",
    kind: "sale_marked",
    recipientId: input.buyerId,
    actorId: input.sellerId,
    title: "El vendedor ha marcado la venta",
    body: input.title,
    href: `/chat/${input.conversationId}`,
    listingId: input.listingId,
    catalogId: input.catalogId,
    conversationId: input.conversationId,
  });
}

export async function notifySaleCompleted(input: {
  listingId: string;
  catalogId: string;
  sellerId: string;
  buyerId: string;
  title: string;
  conversationId: string;
}): Promise<void> {
  return recordListingNotification({
    eventKey: `sale-completed:${input.listingId}`,
    eventType: "sale.completed",
    kind: "sale_completed",
    recipientId: input.sellerId,
    actorId: input.buyerId,
    title: "Venta completada",
    body: `${input.title}: el comprador confirmó la recepción.`,
    href: `/chat/${input.conversationId}`,
    listingId: input.listingId,
    catalogId: input.catalogId,
    conversationId: input.conversationId,
  });
}

export async function getUserNotifications(
  userId: string,
  limit = 50,
): Promise<MarketplaceNotification[]> {
  const state = await readInitializedState();
  return notificationsFromState(state, userId, limit);
}

function notificationsFromState(
  state: MarketplaceCommunicationState,
  userId: string,
  limit: number,
): MarketplaceNotification[] {
  return state.notifications
    .filter((notification) => notification.recipientId === userId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, Math.max(1, Math.min(100, limit)))
    .map((notification) => ({ ...notification }));
}

function communicationSummaryFromState(
  state: MarketplaceCommunicationState,
  userId: string,
): MarketplaceCommunicationSummary {
  const conversations = state.conversations.filter(
    (conversation) => conversation.buyerId === userId || conversation.sellerId === userId,
  );
  return {
    unreadNotifications: state.notifications.filter(
      (notification) => notification.recipientId === userId && !notification.readAt,
    ).length,
    unreadMessages: conversations.reduce(
      (total, conversation) =>
        total + unreadMessagesForConversation(state, conversation, userId).length,
      0,
    ),
  };
}

export async function getCommunicationSummary(
  userId: string,
): Promise<MarketplaceCommunicationSummary> {
  return communicationSummaryFromState(await readInitializedState(), userId);
}

export async function getUserNotificationInbox(
  userId: string,
  limit = 50,
): Promise<{
  notifications: MarketplaceNotification[];
  summary: MarketplaceCommunicationSummary;
}> {
  const state = await readInitializedState();
  return {
    notifications: notificationsFromState(state, userId, limit),
    summary: communicationSummaryFromState(state, userId),
  };
}

export async function getUserCommunicationOverview(
  userId: string,
  limit = 6,
): Promise<{
  notifications: MarketplaceNotification[];
  summary: MarketplaceCommunicationSummary;
  conversations: Array<{ conversation: MarketplaceConversation; unreadCount: number }>;
}> {
  const state = await readInitializedState();
  const conversations = state.conversations
    .filter((conversation) => conversation.buyerId === userId || conversation.sellerId === userId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, Math.max(1, Math.min(20, limit)))
    .map((conversation) => ({
      conversation: hydrateConversation(state, conversation),
      unreadCount: unreadMessagesForConversation(state, conversation, userId).length,
    }));

  return {
    notifications: notificationsFromState(state, userId, limit),
    summary: communicationSummaryFromState(state, userId),
    conversations,
  };
}

export async function markNotificationsRead(input: {
  userId: string;
  notificationIds?: string[];
}): Promise<{ ok: true; readCount: number }> {
  const requestedIds = input.notificationIds?.length
    ? new Set(input.notificationIds.slice(0, 100))
    : null;
  return mutateInitializedState((state) => {
    const unread = state.notifications.filter(
      (notification) =>
        notification.recipientId === input.userId &&
        !notification.readAt &&
        (!requestedIds || requestedIds.has(notification.id)),
    );
    if (unread.length === 0) {
      return { next: state, result: { ok: true, readCount: 0 } as const, changed: false };
    }
    const readAt = new Date().toISOString();
    for (const notification of unread) notification.readAt = readAt;
    return { next: state, result: { ok: true, readCount: unread.length } as const };
  });
}
