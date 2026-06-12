import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { ChatMessage, MarketplaceConversation } from "./marketplace-types";
import { getListing } from "./listings";

const CONV_FILE = path.join(process.cwd(), "data", "marketplace", "conversations.json");

function ensureDir() {
  const dir = path.dirname(CONV_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readConversations(): MarketplaceConversation[] {
  ensureDir();
  try {
    return JSON.parse(readFileSync(CONV_FILE, "utf-8")) as MarketplaceConversation[];
  } catch {
    return [];
  }
}

function writeConversations(conversations: MarketplaceConversation[]) {
  ensureDir();
  writeFileSync(CONV_FILE, JSON.stringify(conversations, null, 2), "utf-8");
}

export function getConversation(id: string): MarketplaceConversation | undefined {
  return readConversations().find((c) => c.id === id);
}

export function findConversation(listingId: string, buyerId: string): MarketplaceConversation | undefined {
  return readConversations().find((c) => c.listingId === listingId && c.buyerId === buyerId);
}

export function getUserConversations(userId: string): MarketplaceConversation[] {
  return readConversations()
    .filter((c) => c.buyerId === userId || c.sellerId === userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function startConversation(input: {
  listingId: string;
  buyerId: string;
  buyerName: string;
}): MarketplaceConversation | { error: string } {
  const listing = getListing(input.listingId);
  if (!listing || listing.status !== "active") {
    return { error: "Este anuncio no está disponible." };
  }
  if (listing.sellerId === input.buyerId) {
    return { error: "No puedes chatear contigo mismo." };
  }

  const existing = findConversation(input.listingId, input.buyerId);
  if (existing) return existing;

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

  const all = readConversations();
  all.push(conversation);
  writeConversations(all);
  return conversation;
}

export function addMessage(input: {
  conversationId: string;
  senderId: string;
  senderName: string;
  body: string;
}): ChatMessage | { error: string } {
  const body = input.body.trim();
  if (!body) return { error: "Mensaje vacío." };

  const all = readConversations();
  const idx = all.findIndex((c) => c.id === input.conversationId);
  if (idx === -1) return { error: "Conversación no encontrada." };

  const conv = all[idx];
  if (conv.buyerId !== input.senderId && conv.sellerId !== input.senderId) {
    return { error: "No autorizado." };
  }

  const message: ChatMessage = {
    id: randomUUID(),
    senderId: input.senderId,
    senderName: input.senderName,
    body,
    createdAt: new Date().toISOString(),
  };

  conv.messages.push(message);
  conv.updatedAt = message.createdAt;
  all[idx] = conv;
  writeConversations(all);
  return message;
}
