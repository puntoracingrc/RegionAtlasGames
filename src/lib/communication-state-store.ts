import path from "path";
import { appDataFile } from "./app-data-dir";
import { assertDurableBlobConfigured, blobAuthConfigured } from "./blob-auth";
import {
  mutateBlobJsonDocument,
  mutateDiskJsonDocument,
  readBlobJsonDocument,
  readDiskJsonDocument,
  type JsonMutation,
} from "./json-document-store";
import type {
  ChatMessage,
  MarketplaceBlock,
  MarketplaceNotification,
} from "./marketplace-types";

const COMMUNICATION_STATE_DOCUMENT = "communications-v1.json";

export type StoredMarketplaceConversation = {
  id: string;
  listingId: string;
  catalogId: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredChatMessage = ChatMessage & {
  conversationId: string;
};

export type ConversationParticipantState = {
  conversationId: string;
  userId: string;
  lastReadMessageId: string | null;
  lastReadAt: string | null;
};

export type CommunicationOutboxEvent = {
  id: string;
  eventKey: string;
  type:
    | "message.created"
    | "listing.approved"
    | "listing.rejected"
    | "sale.marked"
    | "sale.completed";
  recipientId: string;
  entityId: string;
  conversationId: string | null;
  listingId: string | null;
  occurredAt: string;
  projectedAt: string;
};

export type MarketplaceCommunicationState = {
  schemaVersion: 1;
  initializedAt: string | null;
  migratedFromLegacyAt: string | null;
  conversations: StoredMarketplaceConversation[];
  messages: StoredChatMessage[];
  participants: ConversationParticipantState[];
  blocks: MarketplaceBlock[];
  notifications: MarketplaceNotification[];
  outbox: CommunicationOutboxEvent[];
};

export function emptyCommunicationState(): MarketplaceCommunicationState {
  return {
    schemaVersion: 1,
    initializedAt: null,
    migratedFromLegacyAt: null,
    conversations: [],
    messages: [],
    participants: [],
    blocks: [],
    notifications: [],
    outbox: [],
  };
}

function shouldUseBlobStorage(): boolean {
  assertDurableBlobConfigured();
  if (process.env.VERCEL) return blobAuthConfigured();
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

function parseCommunicationState(raw: string): MarketplaceCommunicationState {
  const parsed = JSON.parse(raw) as Partial<MarketplaceCommunicationState> | null;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("El estado central de comunicaciones no es válido.");
  }
  if (parsed.schemaVersion !== 1) {
    throw new Error("La versión del estado central de comunicaciones no es compatible.");
  }
  return {
    schemaVersion: 1,
    initializedAt: typeof parsed.initializedAt === "string" ? parsed.initializedAt : null,
    migratedFromLegacyAt:
      typeof parsed.migratedFromLegacyAt === "string" ? parsed.migratedFromLegacyAt : null,
    conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [],
    messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    participants: Array.isArray(parsed.participants) ? parsed.participants : [],
    blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
    notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
    outbox: Array.isArray(parsed.outbox) ? parsed.outbox : [],
  };
}

function blobOptions() {
  return {
    pathname: `region-atlas/marketplace/${COMMUNICATION_STATE_DOCUMENT}`,
    empty: emptyCommunicationState,
    parse: parseCommunicationState,
    maximumSizeInBytes: 64 * 1024 * 1024,
    cacheControlMaxAge: 30,
  };
}

function diskOptions() {
  return {
    pathname: appDataFile(path.join("marketplace", COMMUNICATION_STATE_DOCUMENT)),
    readCandidates: [
      path.join(process.cwd(), "data", "marketplace", COMMUNICATION_STATE_DOCUMENT),
    ],
    empty: emptyCommunicationState,
    parse: parseCommunicationState,
  };
}

export async function readCommunicationState(): Promise<MarketplaceCommunicationState> {
  try {
    if (shouldUseBlobStorage()) return await readBlobJsonDocument(blobOptions());
    return await readDiskJsonDocument(diskOptions());
  } catch (error) {
    console.error("[communications-store] read failed", error);
    throw new Error("No se pudieron leer las comunicaciones. Inténtalo de nuevo más tarde.");
  }
}

export async function mutateCommunicationState<R>(
  mutation: JsonMutation<MarketplaceCommunicationState, R>,
): Promise<R> {
  try {
    if (shouldUseBlobStorage()) {
      return await mutateBlobJsonDocument(blobOptions(), mutation);
    }
    return await mutateDiskJsonDocument(diskOptions(), mutation);
  } catch (error) {
    console.error("[communications-store] mutation failed", error);
    throw new Error("No se pudieron guardar las comunicaciones. Inténtalo de nuevo más tarde.");
  }
}
