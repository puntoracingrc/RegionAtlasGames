import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { assertAdminApi } from "@/lib/admin-auth";
import { readPriceSourceSettings, writePriceSourceSettings } from "@/lib/price-source-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await assertAdminApi();
  if (!admin) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  return NextResponse.json(
    { ok: true, settings: await readPriceSourceSettings() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: Request) {
  const admin = await assertAdminApi();
  if (!admin) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  try {
    const payload = await request.json();
    const result = await writePriceSourceSettings(payload);
    revalidatePath("/admin/precios");
    return NextResponse.json(
      { ok: true, settings: result.settings, worker: result.worker },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "No se pudieron guardar las fuentes" },
      { status: 400 },
    );
  }
}
