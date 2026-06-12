import { NextResponse } from "next/server";
import { getCurrentUser, updateUserTheme } from "@/lib/users";
import type { ThemePreference } from "@/lib/session";

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const body = await request.json();
  const theme = body.theme as ThemePreference;
  if (!["light", "dark", "system"].includes(theme)) {
    return NextResponse.json({ error: "Tema no válido." }, { status: 400 });
  }

  const updated = await updateUserTheme(user.id, theme);
  return NextResponse.json({ user: updated });
}
