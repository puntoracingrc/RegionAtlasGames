import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { fillAdminSeriesDescriptionWithAi } from "@/lib/admin-series-ai-fill";

type Props = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: Props) {
  const admin = await assertAdminApi();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { slug } = await params;
  const body = (await request.json().catch(() => ({}))) as { description?: unknown };
  const result = await fillAdminSeriesDescriptionWithAi(
    slug,
    typeof body.description === "string" ? body.description : null,
  );
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
