import { NextResponse } from "next/server";
import { enrichCollectionItem } from "@/lib/catalog";
import { saveCollectionPhotoFile } from "@/lib/collection-photo-storage";
import { validateCollectionPhoto } from "@/lib/collection-photo-validation";
import { isCollectionPhotoSlot } from "@/lib/collection-photos";
import {
  getUserCollectionItem,
  upsertUserCollectionPhoto,
} from "@/lib/collection-store";
import { normalizeListingPhoto } from "@/lib/listing-photo-sharp";
import { MAX_PHOTO_BYTES } from "@/lib/listing-photos";
import { marketplaceRateLimitResponse } from "@/lib/marketplace-request-security";
import { getCurrentUser } from "@/lib/users";

type Params = { params: Promise<{ itemId: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

  const { itemId } = await params;
  const item = await getUserCollectionItem(user.id, itemId);
  if (!item) {
    return NextResponse.json({ error: "Copia no encontrada en tu colección." }, { status: 404 });
  }

  const rateLimited = await marketplaceRateLimitResponse(request, {
    action: "collection-photo-upload",
    userId: user.id,
    limit: 80,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimited) return rateLimited;

  try {
    const form = await request.formData();
    const slot = String(form.get("slot") ?? "");
    const file = form.get("file");
    if (!isCollectionPhotoSlot(slot)) {
      return NextResponse.json({ error: "Hueco de foto no válido." }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
    }
    if (file.size > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: "La imagen supera el límite de 12 MB." }, { status: 413 });
    }
    if (file.type && !file.type.startsWith("image/")) {
      return NextResponse.json({ error: "El archivo debe ser una imagen." }, { status: 415 });
    }

    const source = Buffer.from(await file.arrayBuffer());
    const validation = await validateCollectionPhoto(source);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const normalized = await normalizeListingPhoto(source);
    const uploadedAt = new Date().toISOString();
    await saveCollectionPhotoFile(user.id, itemId, slot, normalized);
    const photo = {
      slot,
      url:
        `/api/user/collection/copies/${encodeURIComponent(itemId)}/photos/${slot}`
        + `?v=${encodeURIComponent(uploadedAt)}`,
      width: validation.width,
      height: validation.height,
      bytes: normalized.length,
      uploadedAt,
    };
    const updated = await upsertUserCollectionPhoto(user.id, itemId, photo);
    if ("error" in updated) {
      return NextResponse.json({ error: updated.error }, { status: 409 });
    }

    return NextResponse.json({ item: enrichCollectionItem(updated.item), photo });
  } catch (error) {
    console.error("[collection-photo-upload] failed", { userId: user.id, itemId, error });
    return NextResponse.json(
      { error: "El almacenamiento de fotos no ha respondido. Vuelve a intentarlo." },
      { status: 503 },
    );
  }
}
