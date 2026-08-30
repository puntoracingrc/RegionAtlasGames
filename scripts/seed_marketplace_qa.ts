import { analyzeListingPhotos } from "../src/lib/ai-listing-analysis";
import { getCatalogGame } from "../src/lib/catalog";
import { catalogGamePath } from "../src/lib/catalog-url";
import { addCatalogGameToCollection } from "../src/lib/collection-store";
import {
  createListingDraft,
  getListing,
  publishListing,
  setListingAiAnalysis,
  upsertListingPhoto,
} from "../src/lib/listings";
import { REQUIRED_PHOTO_SLOTS } from "../src/lib/marketplace-types";
import { registerUser } from "../src/lib/users";

const dataDir = process.env.APP_DATA_DIR?.trim() ?? "";
if (process.env.VERCEL || !dataDir.includes("region-atlas-marketplace-qa")) {
  throw new Error("Esta semilla solo puede ejecutarse en un APP_DATA_DIR temporal de QA.");
}
if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) {
  throw new Error("Desactiva las credenciales Blob antes de ejecutar la semilla de QA.");
}

async function main() {
  const password = "RegionAtlas-QA-2026";
  const sellerResult = await registerUser({
    name: "Laura Vendedora",
    email: "laura.vendedora@example.test",
    password,
    city: "Madrid",
  });
  if ("error" in sellerResult) throw new Error(sellerResult.error);

  const buyerResult = await registerUser({
    name: "Carlos Comprador",
    email: "carlos.comprador@example.test",
    password,
    city: "Valencia",
  });
  if ("error" in buyerResult) throw new Error(buyerResult.error);

  const catalogId = "ps4-13-sentinels-aegis-rim";
  const game = getCatalogGame(catalogId);
  if (!game) throw new Error("Falta el juego de QA.");
  const frontPhotoUrl = process.env.MARKETPLACE_QA_FRONT_PHOTO_URL?.trim();
  const backPhotoUrl = process.env.MARKETPLACE_QA_BACK_PHOTO_URL?.trim();
  if (!frontPhotoUrl || !backPhotoUrl || frontPhotoUrl === backPhotoUrl) {
    throw new Error(
      "La QA necesita MARKETPLACE_QA_FRONT_PHOTO_URL y MARKETPLACE_QA_BACK_PHOTO_URL distintas. No se duplican portadas para simular evidencias.",
    );
  }
  const added = await addCatalogGameToCollection(sellerResult.user.id, catalogId);
  if ("error" in added) throw new Error(added.error);

  const draft = await createListingDraft({
    sellerId: sellerResult.user.id,
    sellerName: sellerResult.user.name,
    sellerCity: sellerResult.user.city,
    collectionItemId: added.item.id,
  });
  if ("error" in draft) throw new Error(draft.error);

  for (const slot of REQUIRED_PHOTO_SLOTS) {
    const photoUrl = slot === "cover-front" ? frontPhotoUrl : backPhotoUrl;
    const stored = await upsertListingPhoto(draft.id, sellerResult.user.id, {
      slot,
      url: photoUrl,
      width: 1200,
      height: 1600,
      bytes: 45_000,
      uploadedAt: new Date().toISOString(),
    });
    if ("error" in stored) throw new Error(stored.error);
  }

  const ready = await getListing(draft.id);
  if (!ready) throw new Error("No se pudo recuperar el anuncio de QA.");
  const analysis = await analyzeListingPhotos(ready, sellerResult.user.plan, sellerResult.user.id);
  if ("error" in analysis) throw new Error(analysis.error);
  if (analysis.verificationStatus !== "verified") {
    throw new Error(
      `La QA no se publica sin verificación real: ${analysis.verificationReasons?.join("; ") || analysis.verificationStatus}`,
    );
  }
  await setListingAiAnalysis(draft.id, analysis);
  const published = await publishListing(draft.id, sellerResult.user.id);
  if ("error" in published) throw new Error(published.error);

  console.log(JSON.stringify({
    seller: { email: sellerResult.user.email, password },
    buyer: { email: buyerResult.user.email, password },
    catalogId,
    catalogPath: catalogGamePath(catalogId),
    listingId: draft.id,
    listingPath: `/venta/${draft.id}`,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
