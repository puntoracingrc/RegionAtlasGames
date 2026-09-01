import { NextResponse } from "next/server";
import { updateCollectionConditionBulk } from "@/lib/collection-bulk-condition";
import { getCurrentUser } from "@/lib/users";

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "La solicitud no es válida." }, { status: 400 });
    }
    const payload = body as Record<string, unknown>;
    const result = await updateCollectionConditionBulk({
      userId: user.id,
      itemIds: payload.itemIds,
      collectionCondition: payload.collectionCondition,
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("[collection-bulk-condition] update failed", error);
    return NextResponse.json(
      { error: "No se pudo aplicar el cambio masivo." },
      { status: 500 },
    );
  }
}
