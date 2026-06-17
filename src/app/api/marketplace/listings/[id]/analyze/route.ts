import { NextResponse } from "next/server";
import { analyzeListingPhotos, aiQuotaRemaining } from "@/lib/ai-listing-analysis";
import { getListing, publishListing, setListingAiAnalysis } from "@/lib/listings";
import { canUseMarketplace } from "@/lib/plans";
import { getCurrentUser } from "@/lib/users";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user || !canUseMarketplace(user.plan)) {
    return NextResponse.json({ error: "Plan Pro requerido." }, { status: 403 });
  }

  const { id } = await params;
  const listing = await getListing(id);
  if (!listing || listing.sellerId !== user.id) {
    return NextResponse.json({ error: "Anuncio no encontrado." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body.action as string | undefined;

  if (action === "publish") {
    const pub = await publishListing(id, user.id);
    if ("error" in pub) return NextResponse.json({ error: pub.error }, { status: 400 });
    return NextResponse.json({ listing: await getListing(id) });
  }

  const analysis = await analyzeListingPhotos(listing, user.plan, user.id);
  if ("error" in analysis) {
    return NextResponse.json(
      { error: analysis.error, quotaRemaining: await aiQuotaRemaining(user.id, user.plan) },
      { status: 400 },
    );
  }

  await setListingAiAnalysis(id, analysis);
  return NextResponse.json({
    analysis,
    quotaRemaining: await aiQuotaRemaining(user.id, user.plan),
    listing: await getListing(id),
  });
}
