import { NextResponse } from "next/server";
import { getCurrentUser, updateUserProfile, updateUserTheme } from "@/lib/users";
import type { ThemePreference } from "@/lib/session";

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const body = await request.json();
  const theme = body.theme as ThemePreference | undefined;
  if (theme !== undefined) {
    if (!["light", "dark", "system"].includes(theme)) {
      return NextResponse.json({ error: "Tema no válido." }, { status: 400 });
    }

    const updated = await updateUserTheme(user.id, theme);
    return NextResponse.json({ user: updated });
  }

  const updated = await updateUserProfile(user.id, {
    city: body.city ?? null,
  });
  if ("error" in updated) {
    return NextResponse.json({ error: updated.error }, { status: 400 });
  }
  return NextResponse.json({ user: updated });
}
