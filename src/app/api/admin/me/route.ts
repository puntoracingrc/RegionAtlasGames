import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";

export async function GET() {
  const admin = await assertAdminApi();
  return NextResponse.json({ admin: Boolean(admin) });
}
