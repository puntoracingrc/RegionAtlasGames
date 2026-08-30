import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { isTrustedMutationOrigin } from "@/lib/request-origin";
import {
  checkRequestRateLimit,
  rateLimitHeaders,
  readJsonBody,
} from "@/lib/request-security";
import {
  getWallapopCampaignOverview,
  isWallapopCampaignAction,
  queueWallapopCampaignControl,
} from "@/lib/wallapop-campaign-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ControlBody = {
  action?: unknown;
};

function response(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0", ...headers },
  });
}
export async function GET() {
  const admin = await assertAdminApi();
  if (!admin) return response({ ok: false, error: "No autorizado." }, 401);
  return response({ ok: true, overview: await getWallapopCampaignOverview() });
}

export async function POST(request: Request) {
  const admin = await assertAdminApi();
  if (!admin) return response({ ok: false, error: "No autorizado." }, 401);
  if (!isTrustedMutationOrigin(request)) {
    return response({ ok: false, error: "Origen de solicitud no permitido." }, 403);
  }

  const rate = await checkRequestRateLimit(request, {
    namespace: "admin_wallapop_campaign_control",
    identity: admin.email,
    limit: 8,
    windowMs: 60 * 60 * 1000,
  });
  if (!rate.allowed) {
    return response(
      { ok: false, error: "Demasiados cambios de estado. Vuelve a comprobarlo más tarde." },
      429,
      rateLimitHeaders(rate),
    );
  }

  const parsed = await readJsonBody<ControlBody>(request, 1_024);
  if (!parsed.ok) return response({ ok: false, error: parsed.error }, parsed.status);
  if (!isWallapopCampaignAction(parsed.data.action)) {
    return response({ ok: false, error: "Acción Wallapop no válida." }, 400);
  }

  try {
    const control = await queueWallapopCampaignControl(parsed.data.action);
    return response({ ok: true, control });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo cambiar el robot Wallapop.";
    console.error("[admin-wallapop-campaign] control failed", { admin: admin.email, message });
    return response({ ok: false, error: message }, 503);
  }
}
