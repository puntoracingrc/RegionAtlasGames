import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  addMessage,
  getCommunicationSummary,
  getConversation,
  getUserCommunicationOverview,
  getUserConversationsWithUnread,
  getUserNotifications,
  markConversationRead,
  markNotificationsRead,
  notifyListingReview,
} from "./conversations";
import type { MarketplaceConversation } from "./marketplace-types";

type EnvironmentSnapshot = Record<string, string | undefined>;

function restoreEnvironment(snapshot: EnvironmentSnapshot) {
  for (const [name, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

test("central communications migrate legacy chat and keep unread events idempotent", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "region-atlas-communications-"));
  const marketplaceDirectory = path.join(directory, "marketplace");
  const env: EnvironmentSnapshot = {
    APP_DATA_DIR: process.env.APP_DATA_DIR,
    VERCEL: process.env.VERCEL,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    BLOB_STORE_ID: process.env.BLOB_STORE_ID,
  };
  process.env.APP_DATA_DIR = directory;
  delete process.env.VERCEL;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_STORE_ID;

  const legacyConversation: MarketplaceConversation = {
    id: "conversation-legacy",
    listingId: "listing-1",
    catalogId: "ps4-13-sentinels-aegis-rim",
    buyerId: "buyer-1",
    buyerName: "Comprador",
    sellerId: "seller-1",
    sellerName: "Vendedora",
    messages: [
      {
        id: "legacy-message",
        senderId: "buyer-1",
        senderName: "Comprador",
        body: "Mensaje anterior a la migración",
        createdAt: "2026-08-30T10:00:00.000Z",
        status: "delivered",
      },
    ],
    createdAt: "2026-08-30T09:59:00.000Z",
    updatedAt: "2026-08-30T10:00:00.000Z",
  };

  try {
    await mkdir(marketplaceDirectory, { recursive: true });
    await writeFile(
      path.join(marketplaceDirectory, "conversations.json"),
      `${JSON.stringify([legacyConversation], null, 2)}\n`,
      "utf8",
    );
    await writeFile(path.join(marketplaceDirectory, "blocks.json"), "[]\n", "utf8");

    assert.equal((await getConversation(legacyConversation.id))?.messages.length, 1);
    const migrated = JSON.parse(
      await readFile(path.join(marketplaceDirectory, "communications-v1.json"), "utf8"),
    ) as { schemaVersion: number; conversations: unknown[]; messages: unknown[] };
    assert.equal(migrated.schemaVersion, 1);
    assert.equal(migrated.conversations.length, 1);
    assert.equal(migrated.messages.length, 1);
    assert.deepEqual(await getCommunicationSummary("seller-1"), {
      unreadNotifications: 0,
      unreadMessages: 0,
    });
    assert.deepEqual(
      await markConversationRead({
        conversationId: legacyConversation.id,
        userId: "unrelated-user",
      }),
      { error: "No autorizado." },
    );

    const first = await addMessage({
      conversationId: legacyConversation.id,
      senderId: "buyer-1",
      senderName: "Comprador",
      body: "¿Sigue disponible?",
      clientMutationId: "same-browser-request",
    });
    assert.ok(!("error" in first));
    const retried = await addMessage({
      conversationId: legacyConversation.id,
      senderId: "buyer-1",
      senderName: "Comprador",
      body: "¿Sigue disponible?",
      clientMutationId: "same-browser-request",
    });
    assert.ok(!("error" in retried));
    assert.equal(first.id, retried.id);
    assert.equal((await getConversation(legacyConversation.id))?.messages.length, 2);
    assert.deepEqual(await getCommunicationSummary("seller-1"), {
      unreadNotifications: 1,
      unreadMessages: 1,
    });
    const overview = await getUserCommunicationOverview("seller-1", 5);
    assert.deepEqual(overview.summary, {
      unreadNotifications: 1,
      unreadMessages: 1,
    });
    assert.equal(overview.notifications.length, 1);
    assert.equal(overview.conversations.length, 1);
    assert.equal(overview.conversations[0]?.unreadCount, 1);
    assert.equal((await getUserConversationsWithUnread("seller-1"))[0]?.unreadCount, 1);
    assert.equal((await getUserNotifications("seller-1"))[0]?.kind, "new_message");
    assert.deepEqual(
      await addMessage({
        conversationId: legacyConversation.id,
        senderId: "unrelated-user",
        senderName: "Intruso",
        body: "No debería entrar",
      }),
      { error: "No autorizado." },
    );

    assert.deepEqual(
      await markConversationRead({
        conversationId: legacyConversation.id,
        userId: "seller-1",
      }),
      { ok: true, readCount: 1 },
    );
    assert.deepEqual(await getCommunicationSummary("seller-1"), {
      unreadNotifications: 0,
      unreadMessages: 0,
    });
    assert.equal((await getConversation(legacyConversation.id))?.messages.at(-1)?.status, "read");

    await notifyListingReview({
      listingId: "listing-1",
      catalogId: legacyConversation.catalogId,
      sellerId: "seller-1",
      title: "13 Sentinels: Aegis Rim",
      action: "approve",
    });
    await notifyListingReview({
      listingId: "listing-1",
      catalogId: legacyConversation.catalogId,
      sellerId: "seller-1",
      title: "13 Sentinels: Aegis Rim",
      action: "approve",
    });
    const notifications = await getUserNotifications("seller-1");
    assert.equal(
      notifications.filter((notification) => notification.kind === "listing_approved").length,
      1,
    );
    assert.deepEqual(await markNotificationsRead({ userId: "seller-1" }), {
      ok: true,
      readCount: 1,
    });
  } finally {
    restoreEnvironment(env);
    await rm(directory, { recursive: true, force: true });
  }
});
