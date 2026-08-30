import { readFileSync } from "fs";
import path from "path";
import { get } from "@vercel/blob";
import { blobAuthConfigured, blobAuthOptions } from "@/lib/blob-auth";
import { isAdminEmail } from "@/lib/admin-auth";
import { getListing } from "@/lib/listings";
import { PHOTO_SLOT_LABELS, type ListingPhotoSlot } from "@/lib/marketplace-types";
import { getCurrentUser } from "@/lib/users";

const PHOTO_DIR = path.join(process.cwd(), "public", "listing-photos");

function listingPhotoBlobPath(listingId: string, slot: string): string {
  return `region-atlas/marketplace/listing-photos/${listingId}/${slot}.jpg`;
}

type Params = { params: Promise<{ id: string; slot: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  const { id, slot } = await params;
  if (!PHOTO_SLOT_LABELS[slot as ListingPhotoSlot]) {
    return Response.json({ error: "Foto no válida." }, { status: 400 });
  }

  const listing = await getListing(id);
  const photo = listing?.photos.find((p) => p.slot === slot);
  if (!listing || !photo) {
    return Response.json({ error: "Foto no encontrada." }, { status: 404 });
  }
  const canReadPrivatePhoto =
    listing.sellerId === user?.id ||
    (listing.status === "sold" && listing.soldToUserId === user?.id) ||
    isAdminEmail(user?.email);
  if (listing.status !== "active" && !canReadPrivatePhoto) {
    return Response.json({ error: "No autorizado." }, { status: 403 });
  }

  if (process.env.VERCEL && blobAuthConfigured()) {
    const auth = await blobAuthOptions("private");
    const result = await get(listingPhotoBlobPath(id, slot), {
      ...auth,
      useCache: listing.status === "active",
    });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return Response.json({ error: "Foto no encontrada." }, { status: 404 });
    }
    return new Response(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType || "image/jpeg",
        "Cache-Control":
          listing.status === "active"
            ? "public, max-age=3600, stale-while-revalidate=86400"
            : "private, no-store",
      },
    });
  }

  try {
    const buffer = readFileSync(path.join(PHOTO_DIR, id, `${slot}.jpg`));
    return new Response(buffer, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": listing.status === "active" ? "public, max-age=3600" : "private, no-store",
      },
    });
  } catch {
    return Response.json({ error: "Foto no encontrada." }, { status: 404 });
  }
}
