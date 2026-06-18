import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { sseEncode, streamAdminAiFill, type AdminAiFillTarget } from "@/lib/admin-ai-fill";
import {
  draftFromStaging,
  readAdminGameDraft,
  writeAdminGameDraft,
} from "@/lib/admin-draft-storage";
import { readCatalogStagingGame } from "@/lib/catalog-staging-storage";

type RouteParams = { params: Promise<{ pcId: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const pcId = Number.parseInt((await params).pcId, 10);
  if (!Number.isFinite(pcId)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const staging = await readCatalogStagingGame(pcId);
  if (!staging) {
    return NextResponse.json({ error: "Juego no encontrado." }, { status: 404 });
  }

  const existing = await readAdminGameDraft(pcId);
  const draft = draftFromStaging(staging, existing);
  const body = await request.json().catch(() => ({})) as {
    manualUrl?: unknown;
    extraInstructions?: unknown;
    targets?: unknown;
  };
  const manualUrl = typeof body.manualUrl === "string" ? body.manualUrl : "";
  const extraInstructions =
    typeof body.extraInstructions === "string" ? body.extraInstructions : "";
  const validTargets = new Set<AdminAiFillTarget>([
    "cover",
    "companies",
    "taxonomy",
    "release",
    "players",
    "support",
    "description",
    "seo",
  ]);
  const targets = Array.isArray(body.targets)
    ? body.targets.filter((target): target is AdminAiFillTarget => typeof target === "string" && validTargets.has(target as AdminAiFillTarget))
    : undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const event of streamAdminAiFill(draft, { manualUrl, extraInstructions, targets })) {
          controller.enqueue(encoder.encode(sseEncode(event)));
          if (event.type === "done") {
            event.draft.slug = draft.slug;
            event.draft.catalogId = draft.catalogId;
            event.draft.platformSlug = draft.platformSlug;
            event.draft.region = draft.region;
            await writeAdminGameDraft(event.draft);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error inesperado";
        controller.enqueue(
          encoder.encode(sseEncode({ type: "error", message })),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
