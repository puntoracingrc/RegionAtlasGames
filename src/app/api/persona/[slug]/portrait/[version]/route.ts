import { getPublicPersonView } from "@/lib/person-public-research";
import { readAdminPersonPortraitFile } from "@/lib/person-portrait-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ slug: string; version: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { slug, version } = await params;
  if (!getPublicPersonView(slug)) {
    return new Response("Not found", { status: 404 });
  }
  const match = version.match(/^([a-f0-9]{64})\.webp$/);
  if (!match) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const image = await readAdminPersonPortraitFile(slug, match[1]);
    return image ?? new Response("Not found", { status: 404 });
  } catch (error) {
    console.error("[person-portrait] read failed", { slug, error });
    return new Response("Portrait unavailable", { status: 503 });
  }
}
