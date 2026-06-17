import { mkdirSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { blobAuthConfigured, blobAuthOptions } from "@/lib/blob-auth";
import { getListing, updateListing } from "@/lib/listings";
import {
  normalizeListingPhoto,
  validateListingPhoto,
} from "@/lib/listing-photo-sharp";
import type { ListingPhotoSlot } from "@/lib/marketplace-types";
import { PHOTO_SLOT_LABELS, REQUIRED_PHOTO_SLOTS } from "@/lib/marketplace-types";
import { canUseMarketplace } from "@/lib/plans";
import { getCurrentUser } from "@/lib/users";

const PHOTO_DIR = path.join(process.cwd(), "public", "listing-photos");

function listingPhotoBlobPath(listingId: string, slot: string): string {
  return `region-atlas/marketplace/listing-photos/${listingId}/${slot}.jpg`;
}

async function saveListingPhoto(listingId: string, slot: string, buffer: Buffer): Promise<string> {
  if (process.env.VERCEL && blobAuthConfigured()) {
    const auth = await blobAuthOptions("private");
    await put(listingPhotoBlobPath(listingId, slot), buffer, {
      ...auth,
      contentType: "image/jpeg",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    });
    return `/api/marketplace/listings/${listingId}/photos/${slot}`;
  }

  const dir = path.join(PHOTO_DIR, listingId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const filename = `${slot}.jpg`;
  writeFileSync(path.join(dir, filename), buffer);
  return `/listing-photos/${listingId}/${filename}`;
}

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user || !canUseMarketplace(user.plan)) {
    return NextResponse.json({ error: "Plan Pro requerido." }, { status: 403 });
  }

  const { id } = await params;
  const listing = await getListing(id);
  if (!listing || listing.sellerId !== user.id) {
    return NextResponse.json({ error: "Anuncio no encontrado." }, { status: 404 });
  }
  if (listing.status === "sold" || listing.status === "cancelled") {
    return NextResponse.json({ error: "Anuncio cerrado." }, { status: 400 });
  }

  const form = await request.formData();
  const slot = form.get("slot") as ListingPhotoSlot | null;
  const file = form.get("file");

  if (!slot || !PHOTO_SLOT_LABELS[slot]) {
    return NextResponse.json({ error: "Slot de foto no válido." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta archivo." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const check = await validateListingPhoto(buffer);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  const normalized = await normalizeListingPhoto(buffer);
  const url = await saveListingPhoto(id, slot, normalized);
  const photos = listing.photos.filter((p) => p.slot !== slot);
  photos.push({
    slot,
    url,
    width: check.width,
    height: check.height,
    bytes: normalized.length,
    uploadedAt: new Date().toISOString(),
  });

  await updateListing(id, { photos, status: listing.status === "active" ? "draft" : listing.status });

  return NextResponse.json({
    photo: photos.find((p) => p.slot === slot),
    required: REQUIRED_PHOTO_SLOTS,
  });
}
