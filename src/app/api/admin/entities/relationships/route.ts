import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { addAdminEntityRelationship, removeAdminEntityRelationship } from "@/lib/admin-franchise-manager";
import { ENTITY_TYPES, RELATIONSHIP_TYPES } from "@/lib/franchise-types";
import type { RelationshipEntityType, RelationshipType } from "@/lib/franchise-types";

function isEntityType(value: unknown): value is RelationshipEntityType {
  return typeof value === "string" && ENTITY_TYPES.some((item) => item === value);
}

function isRelationshipType(value: unknown): value is RelationshipType {
  return typeof value === "string" && RELATIONSHIP_TYPES.some((item) => item === value);
}

export async function POST(req: Request) {
  const admin = await assertAdminApi();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!isEntityType(body.sourceType) || !isEntityType(body.targetType) || !isRelationshipType(body.relationshipType)) {
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
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: Request) {
  const admin = await assertAdminApi();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const result = await removeAdminEntityRelationship(searchParams.get("id") ?? "");
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
