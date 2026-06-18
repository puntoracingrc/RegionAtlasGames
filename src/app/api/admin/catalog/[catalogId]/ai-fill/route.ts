import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { sseEncode, streamAdminAiFill, type AdminAiFillTarget } from "@/lib/admin-ai-fill";
import {
  draftFromCatalogGame,
  getPublishedGameForAdmin,
  updatePublishedCatalogGame,
} from "@/lib/admin-catalog-publish";
import { getGameDetails } from "@/lib/indexes";

type RouteParams = { params: Promise<{ catalogId: string }> };

const VALID_TARGETS = new Set<AdminAiFillTarget>([
  "cover",
  "companies",
  "taxonomy",
  "release",
  "players",
  "support",
  "description",
  "seo",
]);

function parseTargets(value: unknown): AdminAiFillTarget[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(
    (target): target is AdminAiFillTarget =>
      typeof target === "string" && VALID_TARGETS.has(target as AdminAiFillTarget),
  );
}

export async function POST(request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const catalogId = decodeURIComponent((await params).catalogId);
  const resolved = await getPublishedGameForAdmin(catalogId);
  if (!resolved) {
    return NextResponse.json({ error: "Juego no encontrado." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    manualUrl?: unknown;
    extraInstructions?: unknown;
    targets?: unknown;
  };
  const manualUrl = typeof body.manualUrl === "string" ? body.manualUrl : "";
  const extraInstructions = typeof body.extraInstructions === "string" ? body.extraInstructions : "";
  const targets = parseTargets(body.targets);
  const draft = draftFromCatalogGame(resolved.game, getGameDetails(resolved.game.id) ?? null);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const event of streamAdminAiFill(draft, { manualUrl, extraInstructions, targets })) {
          controller.enqueue(encoder.encode(sseEncode(event)));
          if (event.type === "done") {
            const saved = await updatePublishedCatalogGame(catalogId, event.draft);
            if ("error" in saved) {
              controller.enqueue(encoder.encode(sseEncode({ type: "error", message: saved.error })));
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error inesperado";
        controller.enqueue(encoder.encode(sseEncode({ type: "error", message })));
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
