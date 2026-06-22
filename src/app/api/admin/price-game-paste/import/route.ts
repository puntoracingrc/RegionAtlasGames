import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { importGamePasteText } from "@/lib/local-game-runner-jobs";

export async function POST(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => null);
    const result = await importGamePasteText({
      platformSlug: body?.platformSlug,
      offerType: body?.offerType,
      pastedText: body?.pastedText,
    });
    if ("error" in result) {
      return NextResponse.json({ ok: false, ...result }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Error inesperado importando el pegado de GAME.",
      },
      { status: 500 },
    );
  }
}
