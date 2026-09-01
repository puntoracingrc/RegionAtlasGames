import { NextResponse } from "next/server";
import platformsData from "../../../../../data/platforms.json";
import { sanitizeCollectionDefaultConditions } from "@/lib/collection-condition-policy";
import {
  getCurrentUser,
  updateUserCollectionDefaultConditions,
  updateUserProfile,
  updateUserTheme,
} from "@/lib/users";
import type { ThemePreference } from "@/lib/session";

const COLLECTION_PLATFORM_SLUGS = new Set(
  (platformsData as Array<{ slug: string }>).map((platform) => platform.slug),
);

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const body = await request.json();
  if (body.collectionDefaultConditions !== undefined) {
    if (
      !body.collectionDefaultConditions ||
      typeof body.collectionDefaultConditions !== "object" ||
      Array.isArray(body.collectionDefaultConditions)
    ) {
      return NextResponse.json(
        { error: "Las preferencias de colección no son válidas." },
        { status: 400 },
      );
    }
    const submittedCount = Object.keys(body.collectionDefaultConditions).length;
    const preferences = sanitizeCollectionDefaultConditions(
      body.collectionDefaultConditions,
      COLLECTION_PLATFORM_SLUGS,
    );
    if (Object.keys(preferences).length !== submittedCount) {
      return NextResponse.json(
        { error: "Hay una plataforma o un estado de colección no válido." },
        { status: 400 },
      );
    }
    const updated = await updateUserCollectionDefaultConditions(user.id, preferences);
    if (!updated) {
      return NextResponse.json(
        { error: "No se pudieron guardar las preferencias." },
        { status: 503 },
      );
    }
    return NextResponse.json({ user: updated });
  }
  const theme = body.theme as ThemePreference | undefined;
  if (theme !== undefined) {
    if (!["light", "dark", "system"].includes(theme)) {
      return NextResponse.json({ error: "Tema no válido." }, { status: 400 });
    }

    const updated = await updateUserTheme(user.id, theme);
    return NextResponse.json({ user: updated });
  }

  const updated = await updateUserProfile(user.id, {
    city: body.city ?? null,
  });
  if ("error" in updated) {
    return NextResponse.json({ error: updated.error }, { status: 400 });
  }
  return NextResponse.json({ user: updated });
}
