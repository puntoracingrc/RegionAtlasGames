import { NextResponse } from "next/server";
import { enrichCollectionItem } from "@/lib/catalog";
import {
  deleteCollectionPhotoFile,
  readCollectionPhotoFile,
} from "@/lib/collection-photo-storage";
import { isCollectionPhotoSlot } from "@/lib/collection-photos";
import {
  getUserCollectionItem,
  removeUserCollectionPhoto,
} from "@/lib/collection-store";
import { getCurrentUser } from "@/lib/users";

type Params = { params: Promise<{ itemId: string; slot: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

  const { itemId, slot } = await params;
  if (!isCollectionPhotoSlot(slot)) {
    return NextResponse.json({ error: "Foto no válida." }, { status: 400 });
  }
  const item = await getUserCollectionItem(user.id, itemId);
  if (!item || !(item.photos ?? []).some((photo) => photo.slot === slot)) {
    return NextResponse.json({ error: "Foto no encontrada." }, { status: 404 });
  }

  const response = await readCollectionPhotoFile(user.id, itemId, slot);
  return response ?? NextResponse.json({ error: "Foto no encontrada." }, { status: 404 });
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

  const { itemId, slot } = await params;
  if (!isCollectionPhotoSlot(slot)) {
    return NextResponse.json({ error: "Foto no válida." }, { status: 400 });
  }
  const result = await removeUserCollectionPhoto(user.id, itemId, slot);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  try {
    await deleteCollectionPhotoFile(user.id, itemId, slot);
  } catch (error) {
    console.error("[collection-photo-delete] cleanup failed", { userId: user.id, itemId, slot, error });
  }
  return NextResponse.json({ item: enrichCollectionItem(result.item) });
}
