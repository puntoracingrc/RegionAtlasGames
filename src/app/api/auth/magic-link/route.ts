import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "El acceso por email ya no está disponible. Continúa con Google." },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
