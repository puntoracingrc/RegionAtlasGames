import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import {
  addAdminEntityRelationship,
  addAdminGameFranchise,
  getAdminFranchise,
  removeAdminEntityRelationship,
  removeAdminGameFranchise,
  removeAdminSeriesFranchise,
  setAdminSeriesFranchise,
  updateAdminGameFranchise,
  updateAdminFranchise,
} from "@/lib/admin-franchise-manager";
import { ENTITY_TYPES, RELATIONSHIP_TYPES } from "@/lib/franchise-types";
import type { FranchiseRole, RelationshipEntityType, RelationshipType } from "@/lib/franchise-types";

type Props = { params: Promise<{ slug: string }> };

function isEntityType(value: unknown): value is RelationshipEntityType {
  return typeof value === "string" && ENTITY_TYPES.some((item) => item === value);
}

function isRelationshipType(value: unknown): value is RelationshipType {
  return typeof value === "string" && RELATIONSHIP_TYPES.some((item) => item === value);
}

function parseRole(value: unknown): FranchiseRole | null | undefined {
  if (value === null) return null;
  return value === "mainline" || value === "spin_off" || value === "side_story" || value === "crossover"
    ? value
    : undefined;
}

export async function GET(_req: Request, { params }: Props) {
  const admin = await assertAdminApi();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { slug } = await params;
  const result = await getAdminFranchise(slug);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true, franchise: result });
}

export async function PATCH(req: Request, { params }: Props) {
  const admin = await assertAdminApi();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { slug } = await params;
  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "update";

  if (action === "update") {
    const result = await updateAdminFranchise(slug, {
      name: typeof body.name === "string" ? body.name : undefined,
      description: typeof body.description === "string" || body.description === null
        ? body.description
        : undefined,
      status: body.status === "draft" || body.status === "published" ? body.status : undefined,
      backgroundImageUrl: typeof body.backgroundImageUrl === "string" || body.backgroundImageUrl === null
        ? body.backgroundImageUrl
        : undefined,
      backgroundImageOpacity: typeof body.backgroundImageOpacity === "number" || body.backgroundImageOpacity === null
        ? body.backgroundImageOpacity
        : undefined,
      backgroundReadability:
        body.backgroundReadability === "soft" ||
        body.backgroundReadability === "normal" ||
        body.backgroundReadability === "strong" ||
        body.backgroundReadability === null
          ? body.backgroundReadability
          : undefined,
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, franchise: result });
  }

  if (action === "set-series") {
    const result = await setAdminSeriesFranchise({
      seriesSlug: typeof body.seriesSlug === "string" ? body.seriesSlug : "",
      franchiseSlug: slug,
      primary: body.primary === true,
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "remove-series") {
    const result = await removeAdminSeriesFranchise({
      seriesSlug: typeof body.seriesSlug === "string" ? body.seriesSlug : "",
      franchiseSlug: slug,
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "add-game") {
    const result = await addAdminGameFranchise({
      gameId: typeof body.gameId === "string" ? body.gameId : "",
      franchiseSlug: slug,
      primary: body.primary === true,
      role: parseRole(body.role),
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "remove-game") {
    const result = await removeAdminGameFranchise({
      gameId: typeof body.gameId === "string" ? body.gameId : "",
      franchiseSlug: slug,
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "update-game") {
    const role = parseRole(body.role);
    if (role === undefined) return NextResponse.json({ error: "Rol no válido." }, { status: 400 });
    const result = await updateAdminGameFranchise({
      gameId: typeof body.gameId === "string" ? body.gameId : "",
      franchiseSlug: slug,
      primary: body.primary === true,
      role,
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "add-relationship") {
    if (
      !isEntityType(body.sourceType) ||
      !isEntityType(body.targetType) ||
      !isRelationshipType(body.relationshipType)
    ) {
      return NextResponse.json({ error: "Tipos de relación no válidos." }, { status: 400 });
    }
    const result = await addAdminEntityRelationship({
      sourceType: body.sourceType,
      sourceId: typeof body.sourceId === "string" ? body.sourceId : "",
      targetType: body.targetType,
      targetId: typeof body.targetId === "string" ? body.targetId : "",
      relationshipType: body.relationshipType,
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "remove-relationship") {
    const result = await removeAdminEntityRelationship(
      typeof body.relationshipId === "string" ? body.relationshipId : "",
    );
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
}
