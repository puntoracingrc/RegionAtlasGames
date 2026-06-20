import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { readPriceSourceSettings, writePriceSourceSettings } from "@/lib/price-source-settings";

export async function GET() {
  const admin = await assertAdminApi();
  if (!admin) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  return NextResponse.json({ ok: true, settings: await readPriceSourceSettings() });
}

export async function PUT(request: Request) {
  const admin = await assertAdminApi();
  if (!admin) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  try {
    const payload = await request.json();
    const settings = await writePriceSourceSettings(payload);
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "No se pudieron guardar las fuentes" },
      { status: 400 },
    );
  }
}
