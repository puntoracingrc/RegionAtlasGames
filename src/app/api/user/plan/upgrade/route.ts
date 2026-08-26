import { NextResponse } from "next/server";
import { setUserPlan } from "@/lib/users";
import { getCurrentUser } from "@/lib/users";

/** MVP: activar Pro sin pasarela de pago (desarrollo / demo). */
export async function POST() {
  if (process.env.DEMO_PLAN_UPGRADE_ENABLED !== "1") {
    return NextResponse.json({ error: "Activación demo no disponible." }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  }

  const updated = await setUserPlan(user.id, "pro");
  if (!updated) {
    return NextResponse.json({ error: "No se pudo actualizar el plan." }, { status: 500 });
  }
  return NextResponse.json({ user: updated });
}
