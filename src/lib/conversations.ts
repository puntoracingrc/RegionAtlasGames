import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { get, put } from "@vercel/blob";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";
import type { ChatMessage, MarketplaceBlock, MarketplaceConversation } from "./marketplace-types";
import { getListing } from "./listings";

const CONV_FILE = path.join(process.cwd(), "data", "marketplace", "conversations.json");
const BLOCKS_FILE = path.join(process.cwd(), "data", "marketplace", "blocks.json");
const CONV_BLOB_PATH = "region-atlas/marketplace/conversations.json";
const BLOCKS_BLOB_PATH = "region-atlas/marketplace/blocks.json";

function useBlobStorage(): boolean {
  if (process.env.VERCEL) return blobAuthConfigured();
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

function ensureDir() {
  const dir = path.dirname(CONV_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readLocalJson<T>(file: string, fallback: T): T {
  ensureDir();
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeLocalJson(file: string, data: unknown) {
  ensureDir();
  writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

async function readBlobJson<T>(blobPath: string, fallback: T): Promise<T> {
  try {
    const auth = await blobAuthOptions("private");
    const result = await get(blobPath, { ...auth, useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return fallback;
    return JSON.parse(await new Response(result.stream).text()) as T;
  } catch {
    return fallback;
  }
}

async function writeBlobJson(blobPath: string, data: unknown) {
  const auth = await blobAuthOptions("private");
  await put(blobPath, JSON.stringify(data, null, 2), {
    ...auth,
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 30,
  });
}

async function readConversations(): Promise<MarketplaceConversation[]> {
  if (useBlobStorage()) return readBlobJson(CONV_BLOB_PATH, []);
  return readLocalJson(CONV_FILE, []);
}

async function writeConversations(conversations: MarketplaceConversation[]) {
  if (useBlobStorage()) return writeBlobJson(CONV_BLOB_PATH, conversations);
  writeLocalJson(CONV_FILE, conversations);
}

async function readBlocks(): Promise<MarketplaceBlock[]> {
  if (useBlobStorage()) return readBlobJson(BLOCKS_BLOB_PATH, []);
  return readLocalJson(BLOCKS_FILE, []);
}

async function writeBlocks(blocks: MarketplaceBlock[]) {
  if (useBlobStorage()) return writeBlobJson(BLOCKS_BLOB_PATH, blocks);
  writeLocalJson(BLOCKS_FILE, blocks);
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
  const all = await readConversations();
  const idx = all.findIndex((c) => c.id === input.conversationId);
  if (idx === -1) return { error: "Conversación no encontrada." };

  const conv = all[idx];
  if (conv.buyerId !== input.blockerId && conv.sellerId !== input.blockerId) {
    return { error: "No autorizado." };
  }

  const blockedId = conv.buyerId === input.blockerId ? conv.sellerId : conv.buyerId;
  const blocks = await readBlocks();
  if (!blocks.some((b) => b.blockerId === input.blockerId && b.blockedId === blockedId)) {
    blocks.push({
      id: randomUUID(),
      blockerId: input.blockerId,
      blockedId,
      conversationId: input.conversationId,
      createdAt: new Date().toISOString(),
    });
    await writeBlocks(blocks);
  }

  conv.blockedByUserIds = Array.from(new Set([...(conv.blockedByUserIds ?? []), input.blockerId]));
  conv.updatedAt = new Date().toISOString();
  all[idx] = conv;
  await writeConversations(all);
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

  const existing = await findConversation(input.listingId, input.buyerId);
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

  const all = await readConversations();
  all.push(conversation);
  await writeConversations(all);
  return conversation;
}

export async function addMessage(input: {
  conversationId: string;
  senderId: string;
  senderName: string;
  body: string;
}): Promise<ChatMessage | { error: string }> {
  const body = input.body.trim();
  if (!body) return { error: "Mensaje vacío." };

  const all = await readConversations();
  const idx = all.findIndex((c) => c.id === input.conversationId);
  if (idx === -1) return { error: "Conversación no encontrada." };

  const conv = all[idx];
  if (conv.buyerId !== input.senderId && conv.sellerId !== input.senderId) {
    return { error: "No autorizado." };
  }
  if (conv.blockedByUserIds?.length || await isUserBlockedBetween(conv.buyerId, conv.sellerId)) {
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

  conv.messages.push(message);
  conv.updatedAt = message.createdAt;
  all[idx] = conv;
  await writeConversations(all);
  return message;
}
