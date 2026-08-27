import { randomUUID } from "crypto";
import type { ChatMessage, MarketplaceBlock, MarketplaceConversation } from "./marketplace-types";
import {
  mutateMarketplaceDocument,
  readMarketplaceDocument,
} from "./marketplace-document-store";
import { getListing } from "./listings";

const CONVERSATIONS_DOCUMENT = "conversations.json";
const BLOCKS_DOCUMENT = "blocks.json";

async function readConversations(): Promise<MarketplaceConversation[]> {
  return readMarketplaceDocument<MarketplaceConversation>(CONVERSATIONS_DOCUMENT);
}

async function mutateConversations<R>(
  mutation: Parameters<typeof mutateMarketplaceDocument<MarketplaceConversation, R>>[1],
): Promise<R> {
  return mutateMarketplaceDocument<MarketplaceConversation, R>(CONVERSATIONS_DOCUMENT, mutation);
}

async function readBlocks(): Promise<MarketplaceBlock[]> {
  return readMarketplaceDocument<MarketplaceBlock>(BLOCKS_DOCUMENT);
}

async function mutateBlocks<R>(
  mutation: Parameters<typeof mutateMarketplaceDocument<MarketplaceBlock, R>>[1],
): Promise<R> {
  return mutateMarketplaceDocument<MarketplaceBlock, R>(BLOCKS_DOCUMENT, mutation);
}

export async function isUserBlockedBetween(a: string, b: string): Promise<boolean> {
  return (await readBlocks()).some(
    (block) =>
      (block.blockerId === a && block.blockedId === b) ||
      (block.blockerId === b && block.blockedId === a),
  );
}

export async function blockConversation(input: {
  conversationId: string;
  blockerId: string;
}): Promise<{ ok: true } | { error: string }> {
  const conv = await getConversation(input.conversationId);
  if (!conv) return { error: "Conversación no encontrada." };
  if (conv.buyerId !== input.blockerId && conv.sellerId !== input.blockerId) {
    return { error: "No autorizado." };
  }

  const blockedId = conv.buyerId === input.blockerId ? conv.sellerId : conv.buyerId;
  await mutateBlocks((blocks) => {
    if (blocks.some((block) => block.blockerId === input.blockerId && block.blockedId === blockedId)) {
      return { next: blocks, result: undefined, changed: false };
    }
    blocks.push({
      id: randomUUID(),
      blockerId: input.blockerId,
      blockedId,
      conversationId: input.conversationId,
      createdAt: new Date().toISOString(),
    });
    return { next: blocks, result: undefined };
  });

  await mutateConversations((conversations) => {
    const idx = conversations.findIndex((stored) => stored.id === input.conversationId);
    if (idx === -1) return { next: conversations, result: undefined, changed: false };
    const stored = conversations[idx];
    stored.blockedByUserIds = Array.from(
      new Set([...(stored.blockedByUserIds ?? []), input.blockerId]),
    );
    stored.updatedAt = new Date().toISOString();
    conversations[idx] = stored;
    return { next: conversations, result: undefined };
  });
  return { ok: true };
}

export async function getConversation(id: string): Promise<MarketplaceConversation | undefined> {
  return (await readConversations()).find((c) => c.id === id);
}

export async function findConversation(listingId: string, buyerId: string): Promise<MarketplaceConversation | undefined> {
  return (await readConversations()).find((c) => c.listingId === listingId && c.buyerId === buyerId);
}

export async function getUserConversations(userId: string): Promise<MarketplaceConversation[]> {
  return (await readConversations())
    .filter((c) => c.buyerId === userId || c.sellerId === userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
  if (await isUserBlockedBetween(listing.sellerId, input.buyerId)) {
    return { error: "No se puede iniciar chat con este usuario." };
  }

  const now = new Date().toISOString();
  const conversation: MarketplaceConversation = {
    id: randomUUID(),
    listingId: input.listingId,
    catalogId: listing.catalogId,
    buyerId: input.buyerId,
    buyerName: input.buyerName,
    sellerId: listing.sellerId,
    sellerName: listing.sellerName,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };

  return mutateConversations<MarketplaceConversation>((conversations) => {
    const existing = conversations.find(
      (stored) => stored.listingId === input.listingId && stored.buyerId === input.buyerId,
    );
    if (existing) return { next: conversations, result: existing, changed: false };
    conversations.push(conversation);
    return { next: conversations, result: conversation };
  });
}

export async function addMessage(input: {
  conversationId: string;
  senderId: string;
  senderName: string;
  body: string;
}): Promise<ChatMessage | { error: string }> {
  const body = input.body.trim();
  if (!body) return { error: "Mensaje vacío." };
  if (body.length > 2_000) return { error: "El mensaje no puede superar 2.000 caracteres." };

  const current = await getConversation(input.conversationId);
  if (!current) return { error: "Conversación no encontrada." };
  if (await isUserBlockedBetween(current.buyerId, current.sellerId)) {
    return { error: "Esta conversación está bloqueada." };
  }

  const message: ChatMessage = {
    id: randomUUID(),
    senderId: input.senderId,
    senderName: input.senderName,
    body,
    createdAt: new Date().toISOString(),
    status: "sent",
  };

  return mutateConversations<ChatMessage | { error: string }>((conversations) => {
    const idx = conversations.findIndex((stored) => stored.id === input.conversationId);
    const conversation = conversations[idx];
    if (!conversation) {
      return {
        next: conversations,
        result: { error: "Conversación no encontrada." } as const,
        changed: false,
      };
    }
    if (conversation.buyerId !== input.senderId && conversation.sellerId !== input.senderId) {
      return {
        next: conversations,
        result: { error: "No autorizado." } as const,
        changed: false,
      };
    }
    if (conversation.blockedByUserIds?.length) {
      return {
        next: conversations,
        result: { error: "Esta conversación está bloqueada." } as const,
        changed: false,
      };
    }

    conversation.messages.push(message);
    conversation.updatedAt = message.createdAt;
    conversations[idx] = conversation;
    return { next: conversations, result: message };
  });
}
