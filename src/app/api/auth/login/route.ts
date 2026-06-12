import { NextResponse } from "next/server";
import { loginUser } from "@/lib/users";

export async function POST(request: Request) {
  const body = await request.json();
  const result = await loginUser(body.email ?? "", body.password ?? "");
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ user: result.user });
}
