import { NextResponse } from "next/server";
import { authConfigErrors } from "@/lib/server-env";
import { getSession } from "@/lib/users";
import { registerUser } from "@/lib/users";

export async function POST(request: Request) {
  const configErrors = authConfigErrors();
  if (configErrors.length > 0) {
    console.error("[auth/register] config", configErrors.join(" "));
    return NextResponse.json(
      { error: "Registro no disponible: configuración del servidor incompleta." },
      { status: 503 },
    );
  }

  try {
    const body = await request.json();
    const result = await registerUser({
      name: body.name ?? "",
      email: body.email ?? "",
      password: body.password ?? "",
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const session = await getSession();
    session.userId = result.user.id;
    session.email = result.user.email;
    session.name = result.user.name;
    session.isLoggedIn = true;
    await session.save();

    return NextResponse.json({ user: result.user });
  } catch {
    return NextResponse.json(
      { error: "Error interno al crear la cuenta. Inténtalo de nuevo." },
      { status: 500 },
    );
  }
}
