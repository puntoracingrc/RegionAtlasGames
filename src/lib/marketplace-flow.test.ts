import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzeListingPhotos } from "./ai-listing-analysis";
import { getCatalogGame } from "./catalog";
import {
  addCatalogCopy,
  addCatalogGameToCollection,
  getUserCollectionItem,
  updateUserCollectionItemDetails,
} from "./collection-store";
import { updateCollectionCopyDetails } from "./collection-copy-details";
import {
  addMessage,
  getConversation,
  startConversation,
} from "./conversations";
import {
  confirmBuyerReceipt,
  createListingDraft,
  getActiveListingsForCatalog,
  getListing,
  getMarketplaceListingClientView,
  getUserMarketplaceActivityListings,
  markListingSold,
  publishListing,
  reviewMarketplaceListing,
  setListingAiAnalysis,
  upsertListingPhoto,
} from "./listings";
import type { ListingPhotoSlot } from "./marketplace-types";
import {
  MANUAL_LISTING_REVIEW_CRITERIA,
  REQUIRED_PHOTO_SLOTS,
} from "./marketplace-types";
import { aiQuotaForPlan, canViewCollectionValue } from "./plans";
import { recordedSalesSummary } from "./recorded-sales";
import { registerUser } from "./users";

type EnvironmentSnapshot = Record<string, string | undefined>;

function restoreEnvironment(snapshot: EnvironmentSnapshot) {
  for (const [name, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function assertResult<T extends object>(
  result: T,
): asserts result is Exclude<T, { error: string }> {
  if (result && typeof result === "object" && "error" in result) {
    assert.fail(String(result.error));
  }
}

test("two free users can publish, chat, close and confirm a sale", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "region-atlas-marketplace-flow-"));
  const env: EnvironmentSnapshot = {
    APP_DATA_DIR: process.env.APP_DATA_DIR,
    VERCEL: process.env.VERCEL,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    BLOB_STORE_ID: process.env.BLOB_STORE_ID,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };
  process.env.APP_DATA_DIR = directory;
  delete process.env.VERCEL;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_STORE_ID;
  delete process.env.OPENAI_API_KEY;

  try {
    assert.equal(canViewCollectionValue("free"), true);
    assert.equal(aiQuotaForPlan("free"), 30);

    const sellerResult = await registerUser({
      name: "Vendedora Simulada",
      email: "seller.marketplace@example.test",
      password: "Test-password-2026",
      city: "Madrid",
    });
    assertResult(sellerResult);
    const buyerResult = await registerUser({
      name: "Comprador Simulado",
      email: "buyer.marketplace@example.test",
      password: "Test-password-2026",
      city: "Valencia",
    });
    assertResult(buyerResult);

    const catalogId = "ps4-13-sentinels-aegis-rim";
    assert.ok(getCatalogGame(catalogId), `Falta el juego de prueba ${catalogId}`);

    const added = await addCatalogGameToCollection(sellerResult.user.id, catalogId);
    assertResult(added);
    const updatedOwnedCopy = await updateUserCollectionItemDetails(
      sellerResult.user.id,
      added.item.id,
      {
        collectionCondition: "complete",
        buyPrice: 12,
        ownerEstimatedPrice: null,
        purchasedAt: "2026-08-01T00:00:00.000Z",
        addedAt: added.item.addedAt ?? new Date().toISOString(),
        notes: null,
      },
    );
    assertResult(updatedOwnedCopy);
    const draft = await createListingDraft({
      sellerId: sellerResult.user.id,
      sellerName: sellerResult.user.name,
      sellerCity: sellerResult.user.city,
      collectionItemId: added.item.id,
    });
    assertResult(draft);
    assert.ok(draft.askingPriceEur && draft.askingPriceEur > 0);
    assert.equal(
      draft.askingPriceEur,
      (await getUserCollectionItem(sellerResult.user.id, added.item.id))?.recommendedPrice,
    );
    assert.equal(draft.collectionCondition, "complete");
    assert.equal(draft.recordedSalePriceEur, null);

    const updatedDraftCopy = await updateCollectionCopyDetails(
      sellerResult.user.id,
      added.item.id,
      {
        collectionCondition: "loose",
        buyPrice: 12,
        ownerEstimatedPrice: 19,
        purchasedAt: "2026-08-01T00:00:00.000Z",
        addedAt: added.item.addedAt ?? new Date().toISOString(),
        notes: null,
      },
    );
    assertResult(updatedDraftCopy);
    assert.equal(updatedDraftCopy.draftSynced, true);
    assert.equal(updatedDraftCopy.item.collectionCondition, "loose");
    assert.equal(updatedDraftCopy.item.ownerEstimatedPrice, 19);
    assert.equal((await getListing(draft.id))?.collectionCondition, "loose");

    const secondCopy = await addCatalogCopy(sellerResult.user.id, catalogId);
    assertResult(secondCopy);
    const secondDraft = await createListingDraft({
      sellerId: sellerResult.user.id,
      sellerName: sellerResult.user.name,
      sellerCity: sellerResult.user.city,
      collectionItemId: secondCopy.item.id,
    });
    assertResult(secondDraft);
    const duplicateSecondDraft = await createListingDraft({
      sellerId: sellerResult.user.id,
      sellerName: sellerResult.user.name,
      sellerCity: sellerResult.user.city,
      collectionItemId: secondCopy.item.id,
    });
    assert.deepEqual(duplicateSecondDraft, {
      error: "Esta copia ya tiene un anuncio abierto.",
      existingListingId: secondDraft.id,
    });

    for (const slot of REQUIRED_PHOTO_SLOTS) {
      const photo = await upsertListingPhoto(draft.id, sellerResult.user.id, {
        slot: slot as ListingPhotoSlot,
        url: `/listing-photos/${draft.id}/${slot}.jpg`,
        width: 1200,
        height: 1600,
        bytes: 45_000,
        contentHash: slot === "cover-front" ? "front-hash" : "back-hash",
        perceptualHash: slot === "cover-front" ? "0000000000000000" : "ffffffffffffffff",
        uploadedAt: new Date().toISOString(),
      });
      assertResult(photo);
    }

    const readyForAnalysis = await getListing(draft.id);
    assert.ok(readyForAnalysis);
    const analysis = await analyzeListingPhotos(
      readyForAnalysis,
      sellerResult.user.plan,
      sellerResult.user.id,
    );
    assertResult(analysis);
    assert.ok(analysis.estimatedPriceEur > 0);
    assert.equal(analysis.verificationStatus, "unavailable");
    assert.ok(await setListingAiAnalysis(draft.id, analysis));
    assert.deepEqual(await publishListing(draft.id, sellerResult.user.id), {
      error: "La comprobación no está cerrada. El anuncio permanece en revisión manual.",
    });
    assert.deepEqual(await reviewMarketplaceListing({
      listingId: draft.id,
      reviewer: "admin@example.test",
      action: "approve",
    }), {
      error: "Confirma los tres criterios antes de aprobar el anuncio.",
    });
    const reviewed = await reviewMarketplaceListing({
      listingId: draft.id,
      reviewer: "admin@example.test",
      action: "approve",
      note: "Portada y contraportada distintas comprobadas en QA.",
      criteria: [...MANUAL_LISTING_REVIEW_CRITERIA],
    });
    assertResult(reviewed);
    assert.equal(reviewed.aiAnalysis?.verificationStatus, "manual_verified");
    assert.equal((await getActiveListingsForCatalog(catalogId)).length, 1);

    assert.deepEqual(
      await updateCollectionCopyDetails(sellerResult.user.id, added.item.id, {
        collectionCondition: "sealed",
        buyPrice: 12,
        ownerEstimatedPrice: 35,
        purchasedAt: "2026-08-01T00:00:00.000Z",
        addedAt: added.item.addedAt ?? new Date().toISOString(),
        notes: null,
      }),
      {
        error: "Retira el anuncio de la venta antes de cambiar el estado de esta copia.",
        status: 409,
      },
    );
    assert.equal((await getListing(draft.id))?.collectionCondition, "loose");

    const conversation = await startConversation({
      listingId: draft.id,
      buyerId: buyerResult.user.id,
      buyerName: buyerResult.user.name,
    });
    assertResult(conversation);
    assertResult(await addMessage({
      conversationId: conversation.id,
      senderId: buyerResult.user.id,
      senderName: buyerResult.user.name,
      body: "Hola, ¿sigue disponible?",
    }));
    assertResult(await addMessage({
      conversationId: conversation.id,
      senderId: sellerResult.user.id,
      senderName: sellerResult.user.name,
      body: "Sí, podemos cerrar la compra.",
    }));
    assert.equal((await getConversation(conversation.id))?.messages.length, 2);

    assert.deepEqual(
      await markListingSold({
        listingId: draft.id,
        sellerId: sellerResult.user.id,
        buyerId: buyerResult.user.id,
        buyerName: conversation.buyerName,
        priceEur: 24.5,
      }),
      { ok: true },
    );
    assert.deepEqual(
      await confirmBuyerReceipt({ listingId: draft.id, buyerId: buyerResult.user.id }),
      { ok: true, recorded: true },
    );
    assert.deepEqual(
      await confirmBuyerReceipt({ listingId: draft.id, buyerId: buyerResult.user.id }),
      { ok: true, recorded: false },
    );
    assert.equal(await getUserCollectionItem(sellerResult.user.id, added.item.id), undefined);

    const sold = await getListing(draft.id);
    assert.equal(sold?.status, "sold");
    assert.equal(sold?.soldToUserId, buyerResult.user.id);
    assert.equal(sold?.soldToUserName, buyerResult.user.name);
    assert.ok(sold?.sellerConfirmedAt);
    assert.ok(sold?.buyerConfirmedAt);
    const clientView = getMarketplaceListingClientView(sold!);
    assert.equal(clientView.recordedSalePriceEur, 24.5);
    assert.ok(clientView.buyerConfirmedAt);
    assert.equal("soldToUserId" in clientView, false);
    assert.deepEqual(
      (await getUserMarketplaceActivityListings(buyerResult.user.id)).buyerListings.map(
        (listing) => listing.id,
      ),
      [draft.id],
    );
    assert.equal((await getActiveListingsForCatalog(catalogId)).length, 0);
    assert.deepEqual(await recordedSalesSummary(catalogId), {
      count: 1,
      medianEur: 24.5,
      latestAt: sold?.buyerConfirmedAt ?? null,
    });
  } finally {
    restoreEnvironment(env);
    await rm(directory, { recursive: true, force: true });
  }
});
