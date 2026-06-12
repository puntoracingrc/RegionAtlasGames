import { NextResponse } from "next/server";
import { setUserPlan } from "@/lib/users";
import { getCurrentUser } from "@/lib/users";

/** MVP: activar Pro sin pasarela de pago (desarrollo / demo). */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  }

  const updated = await setUserPlan(user.id, "pro");
  return NextResponse.json({ user: updated });
}
