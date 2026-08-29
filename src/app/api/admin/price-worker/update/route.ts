import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import {
  getPcWorkerUpdateOverview,
  isPcWorkerUpdateAction,
  queuePcWorkerUpdate,
} from "@/lib/price-worker-update";
import { isTrustedMutationOrigin } from "@/lib/request-origin";
import {
  checkRequestRateLimit,
  rateLimitHeaders,
  readJsonBody,
} from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UpdateBody = {
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

  return response({ ok: true, overview: await getPcWorkerUpdateOverview() });
}

export async function POST(request: Request) {
  const admin = await assertAdminApi();
  if (!admin) return response({ ok: false, error: "No autorizado." }, 401);
  if (!isTrustedMutationOrigin(request)) {
    return response({ ok: false, error: "Origen de solicitud no permitido." }, 403);
  }

  const rate = await checkRequestRateLimit(request, {
    namespace: "admin_pc_worker_update",
    identity: admin.email,
    limit: 4,
    windowMs: 60 * 60 * 1000,
  });
  if (!rate.allowed) {
    return response(
      { ok: false, error: "Demasiados intentos de actualización. Vuelve a comprobarlo más tarde." },
      429,
      rateLimitHeaders(rate),
    );
  }

  const parsed = await readJsonBody<UpdateBody>(request, 1_024);
  if (!parsed.ok) return response({ ok: false, error: parsed.error }, parsed.status);
  if (!isPcWorkerUpdateAction(parsed.data.action)) {
    return response({ ok: false, error: "Acción de actualización no válida." }, 400);
  }

  try {
    const update = await queuePcWorkerUpdate(parsed.data.action);
    return response({ ok: true, update });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo crear la actualización.";
    console.error("[admin-pc-worker-update] queue failed", { admin: admin.email, message });
    return response({ ok: false, error: message }, 503);
  }
}
