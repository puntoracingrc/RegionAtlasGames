import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { addContributor, listContributors } from "@/lib/admin-contributors";

export async function GET() {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const contributors = await listContributors();
  return NextResponse.json({ ok: true, contributors });
}

export async function POST(request: Request) {
  const admin = await assertAdminApi();
  if (!admin) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const body = (await request.json()) as { email?: string };
  const email = body.email?.trim();
  if (!email) {
    return NextResponse.json({ error: "Falta el email." }, { status: 400 });
  }

  const result = await addContributor(email, admin.email);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, contributor: result.entry });
}
