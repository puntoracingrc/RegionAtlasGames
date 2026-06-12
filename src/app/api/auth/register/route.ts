import { NextResponse } from "next/server";
import { getSession } from "@/lib/users";
import { registerUser } from "@/lib/users";

export async function POST(request: Request) {
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
}
