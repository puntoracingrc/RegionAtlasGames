import { NextResponse } from "next/server";
import { getStaffRole } from "@/lib/contributor-access";
import { getCurrentUser } from "@/lib/users";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ admin: false, contributor: false, role: null });
  }

  const role = await getStaffRole(user.email);
  return NextResponse.json({
    admin: role === "admin",
    contributor: role === "contributor",
    role,
    email: user.email,
  });
}
