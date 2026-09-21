import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import {
  draftFromCatalogGame,
  getPublishedGameForAdmin,
  updatePublishedCatalogGame,
} from "@/lib/admin-catalog-publish";
import {
  isPhysicalReleaseImageRole,
  upsertPhysicalReleaseImage,
} from "@/lib/admin-physical-release-image";
import { resolveCatalogIdParam } from "@/lib/catalog";
import {
  PHYSICAL_EVIDENCE_TYPE_VALUES,
  type CatalogPhysicalEvidenceType,
} from "@/lib/catalog-edition-guide-types";
import {
  getCatalogByPlatformWithOverlay,
  triggerCatalogDeployHook,
} from "@/lib/catalog-runtime-overlay";
import {
  MAX_COVER_UPLOAD_BYTES,
  uploadCoverToCdn,
  validateImageUploadEnvelope,
} from "@/lib/covers-upload";

export const maxDuration = 180;

type RouteParams = { params: Promise<{ catalogId: string }> };

const ROLE_FILE_LABELS = {
  front: "portada",
  back: "contraportada",
  spine: "lomo",
  contents: "contenido",
} as const;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado al subir la imagen física.";
}

function isEvidenceType(value: string): value is CatalogPhysicalEvidenceType {
  return PHYSICAL_EVIDENCE_TYPE_VALUES.includes(value as CatalogPhysicalEvidenceType);
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    if (!(await assertAdminApi())) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    const catalogId = resolveCatalogIdParam((await params).catalogId);
    const resolved = await getPublishedGameForAdmin(catalogId);
    if (!resolved) {
      return NextResponse.json({ error: "Juego no encontrado." }, { status: 404 });
    }

    const draft = draftFromCatalogGame(resolved.game, resolved.details);
    if (!draft.physicalReleaseGroup) {
      return NextResponse.json(
        { error: "Esta ficha no tiene una caja física V2 a la que asociar la imagen." },
        { status: 400 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    const roleValue = String(form.get("role") ?? "").trim();
    const evidenceValue = String(form.get("evidenceType") ?? "REAL_SCAN").trim();
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Falta el archivo de imagen." }, { status: 400 });
    }
    if (!isPhysicalReleaseImageRole(roleValue)) {
      return NextResponse.json({ error: "Tipo de imagen física no válido." }, { status: 400 });
    }
    if (!isEvidenceType(evidenceValue)) {
      return NextResponse.json({ error: "Procedencia de imagen no válida." }, { status: 400 });
    }

    const envelopeError = validateImageUploadEnvelope(file, MAX_COVER_UPLOAD_BYTES);
    if (envelopeError) {
      return NextResponse.json(
        { error: envelopeError },
        { status: file.size > MAX_COVER_UPLOAD_BYTES ? 413 : 415 },
      );
    }

    const version = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
    const uploaded = await uploadCoverToCdn({
      platformSlug: draft.platformSlug,
      slug: `${draft.slug}-${ROLE_FILE_LABELS[roleValue]}-${version}`,
      catalogId: draft.catalogId,
      fileBuffer: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type,
    });
    if ("error" in uploaded) {
      return NextResponse.json({ error: uploaded.error }, { status: 502 });
    }

    const nextGroup = upsertPhysicalReleaseImage(draft.physicalReleaseGroup, {
      role: roleValue,
      url: uploaded.coverUrl,
      width: uploaded.width,
      height: uploaded.height,
      evidenceType: evidenceValue,
    });
    const platformGames = await getCatalogByPlatformWithOverlay(draft.platformSlug);
    const peerIds = platformGames
      .filter((game) => game.physicalReleaseGroup?.id === draft.physicalReleaseGroup?.id)
      .map((game) => game.id);
    const targetIds = peerIds.length > 0 ? peerIds : [catalogId];
    let currentDraft = { ...draft, physicalReleaseGroup: nextGroup };

    for (const targetId of targetIds) {
      const peer = targetId === catalogId ? resolved : await getPublishedGameForAdmin(targetId);
      if (!peer) continue;
      const peerDraft = draftFromCatalogGame(peer.game, peer.details);
      const nextDraft = {
        ...peerDraft,
        physicalReleaseGroup: nextGroup,
        coverUrl: roleValue === "front" ? uploaded.coverUrl : peerDraft.coverUrl,
      };
      const saved = await updatePublishedCatalogGame(targetId, nextDraft, { triggerDeploy: false });
      if ("error" in saved) {
        return NextResponse.json(
          { error: `La imagen se subió, pero no se pudo asociar a ${targetId}: ${saved.error}` },
          { status: 500 },
        );
      }
      if (targetId === catalogId) currentDraft = nextDraft;
    }

    const deployHook = await triggerCatalogDeployHook();
    return NextResponse.json({
      ok: true,
      imageUrl: uploaded.coverUrl,
      role: roleValue,
      updatedCatalogIds: targetIds,
      physicalReleaseGroup: nextGroup,
      draft: currentDraft,
      deployHook,
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
