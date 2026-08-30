import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { inspectStoredListingPhotoEvidence } from "@/lib/ai-listing-analysis";
import { getListing, reviewMarketplaceListing } from "@/lib/listings";
import {
  MANUAL_LISTING_REVIEW_CRITERIA,
  type ManualListingReviewCriterion,
} from "@/lib/marketplace-types";
import { marketplaceRateLimitResponse } from "@/lib/marketplace-request-security";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const admin = await assertAdminApi();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const rateLimited = await marketplaceRateLimitResponse(request, {
    action: "marketplace-admin-review",
    userId: admin.id,
    limit: 120,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({}));
  const action = body.action === "approve" || body.action === "reject" ? body.action : null;
  if (!action) {
    return NextResponse.json({ error: "Acción de revisión no válida." }, { status: 400 });
  }
  const { id } = await params;
  const criteria = Array.isArray(body.criteria)
    ? body.criteria.filter(
        (criterion: unknown): criterion is ManualListingReviewCriterion => (
          typeof criterion === "string"
          && MANUAL_LISTING_REVIEW_CRITERIA.includes(criterion as ManualListingReviewCriterion)
        ),
      )
    : [];
  if (
    action === "approve"
    && !MANUAL_LISTING_REVIEW_CRITERIA.every((criterion) => criteria.includes(criterion))
  ) {
    return NextResponse.json(
      { error: "Confirma los tres criterios antes de aprobar el anuncio." },
      { status: 400 },
    );
  }
  if (action === "approve") {
    const listing = await getListing(id);
    if (!listing) {
      return NextResponse.json({ error: "Anuncio no encontrado." }, { status: 404 });
    }
    const inspection = await inspectStoredListingPhotoEvidence(listing);
    if (!inspection.ok) {
      return NextResponse.json(
        { error: inspection.error ?? "No se pudieron validar los archivos de las fotos." },
        { status: 409 },
      );
    }
  }
  const result = await reviewMarketplaceListing({
    listingId: id,
    reviewer: admin.email,
    action,
    note: typeof body.note === "string" ? body.note : undefined,
    criteria,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ ok: true, listing: result });
}
