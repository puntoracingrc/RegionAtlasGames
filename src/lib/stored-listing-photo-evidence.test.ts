import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { inspectStoredListingPhotoEvidence } from "./ai-listing-analysis";
import type { MarketplaceListing } from "./marketplace-types";

async function patternedJpeg(reverse = false): Promise<Buffer> {
  const width = 32;
  const height = 32;
  const data = Buffer.alloc(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const light = reverse ? x < width / 2 : x >= width / 2;
      data[y * width + x] = light ? 255 : 0;
    }
  }
  return sharp(data, { raw: { width, height, channels: 1 } }).jpeg().toBuffer();
}

function listing(id: string): MarketplaceListing {
  const now = new Date(0).toISOString();
  return {
    id,
    catalogId: "ps4-13-sentinels-aegis-rim",
    sellerId: "seller",
    sellerName: "Seller",
    sellerCity: null,
    collectionItemId: "collection-item",
    title: "13 Sentinels: Aegis Rim",
    customTitle: null,
    customDescription: null,
    saleOptions: { pickup: true, shipping: true },
    platformSlug: "ps4",
    region: "PAL España",
    status: "draft",
    photos: ["cover-front", "cover-back"].map((slot) => ({
      slot: slot as "cover-front" | "cover-back",
      url: `/listing-photos/${id}/${slot}.jpg`,
      width: 1200,
      height: 1600,
      bytes: 50_000,
      uploadedAt: now,
    })),
    aiAnalysis: null,
    sealed: false,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    soldToUserId: null,
    soldToUserName: null,
    sellerConfirmedAt: null,
    buyerConfirmedAt: null,
    recordedSalePriceEur: null,
  };
}

test("manual review re-reads legacy photos and blocks repeated image files", async () => {
  const id = `qa-${randomUUID()}`;
  const directory = path.join(process.cwd(), "public", "listing-photos", id);
  await mkdir(directory, { recursive: true });
  try {
    const front = await patternedJpeg();
    await writeFile(path.join(directory, "cover-front.jpg"), front);
    await writeFile(path.join(directory, "cover-back.jpg"), front);

    const duplicate = await inspectStoredListingPhotoEvidence(listing(id));
    assert.equal(duplicate.ok, false);
    assert.equal(duplicate.kind, "duplicate");
    assert.equal(duplicate.uniquePhotoCount, 1);

    await writeFile(path.join(directory, "cover-back.jpg"), await patternedJpeg(true));
    const distinct = await inspectStoredListingPhotoEvidence(listing(id));
    assert.equal(distinct.ok, true);
    assert.equal(distinct.uniquePhotoCount, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
