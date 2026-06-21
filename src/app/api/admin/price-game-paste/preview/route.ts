import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { previewGamePasteText } from "@/lib/local-game-runner-jobs";

export async function POST(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const preview = previewGamePasteText(String(body?.pastedText ?? ""));
  return NextResponse.json({ ok: true, preview });
}
