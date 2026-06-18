import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { readNewsSettings, writeNewsSettings } from "@/lib/news-settings";

export async function GET() {
  const admin = await assertAdminApi();
  if (!admin) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  return NextResponse.json({ ok: true, settings: await readNewsSettings() });
}

export async function PUT(request: Request) {
  const admin = await assertAdminApi();
  if (!admin) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  try {
    const payload = await request.json();
    const settings = await writeNewsSettings(payload);
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "No se pudieron guardar los ajustes" },
      { status: 400 },
    );
  }
}
