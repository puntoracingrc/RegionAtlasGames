import { mkdirSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { blobAuthConfigured, blobAuthOptions } from "@/lib/blob-auth";
import {
  getListing,
  getMarketplaceListingClientView,
  upsertListingPhoto,
} from "@/lib/listings";
import {
  fingerprintListingPhoto,
  normalizeListingPhoto,
  validateListingPhoto,
} from "@/lib/listing-photo-sharp";
import type { ListingPhotoSlot } from "@/lib/marketplace-types";
import { PHOTO_SLOT_LABELS, REQUIRED_PHOTO_SLOTS } from "@/lib/marketplace-types";
import { findDuplicateListingPhoto, MAX_PHOTO_BYTES } from "@/lib/listing-photos";
import { marketplaceRateLimitResponse } from "@/lib/marketplace-request-security";
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
  const { id } = await params;
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
    }
    const rateLimited = await marketplaceRateLimitResponse(request, {
      action: "photo-upload",
      userId: user.id,
      limit: 80,
      windowMs: 60 * 60 * 1000,
    });
    if (rateLimited) return rateLimited;

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
    if (file.size > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: "La imagen supera el límite de 12 MB." }, { status: 413 });
    }
    if (file.type && !file.type.startsWith("image/")) {
      return NextResponse.json({ error: "El archivo debe ser una imagen." }, { status: 415 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const check = await validateListingPhoto(buffer);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    const normalized = await normalizeListingPhoto(buffer);
    const fingerprint = await fingerprintListingPhoto(normalized);
    const candidate = {
      slot,
      url: "",
      width: check.width,
      height: check.height,
      bytes: normalized.length,
      ...fingerprint,
      uploadedAt: new Date().toISOString(),
    };
    const duplicate = findDuplicateListingPhoto(listing.photos, candidate);
    if (duplicate) {
      return NextResponse.json(
        {
          error:
            `Esta foto repite «${PHOTO_SLOT_LABELS[duplicate.slot]}». `
            + "Sube una imagen distinta para cada vista.",
        },
        { status: 409 },
      );
    }

    const url = await saveListingPhoto(id, slot, normalized);
    const photo = {
      ...candidate,
      url,
    };

    const updated = await upsertListingPhoto(id, user.id, photo);
    if ("error" in updated) {
      return NextResponse.json({ error: updated.error }, { status: 409 });
    }

    return NextResponse.json({
      photo: updated.photo,
      required: REQUIRED_PHOTO_SLOTS,
      listing: getMarketplaceListingClientView((await getListing(id))!),
    });
  } catch (error) {
    console.error("[listing-photo-upload] failed", { listingId: id, error });
    return NextResponse.json(
      { error: "El almacenamiento de fotos no ha respondido. Vuelve a intentarlo en unos instantes." },
      { status: 503 },
    );
  }
}
