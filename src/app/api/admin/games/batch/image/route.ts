import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import {
  MAX_COVER_UPLOAD_BYTES,
  uploadCoverToCdn,
  validateImageUploadEnvelope,
} from "@/lib/covers-upload";
import { slugify } from "@/lib/slug";

export const maxDuration = 180;

export async function POST(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const platformSlug = String(form.get("platformSlug") ?? "").trim();
  const targetSlug = slugify(String(form.get("targetSlug") ?? ""));
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta la imagen." }, { status: 400 });
  }
  if (!platformSlug || !targetSlug) {
    return NextResponse.json({ error: "Falta plataforma o destino de imagen." }, { status: 400 });
  }
  const envelopeError = validateImageUploadEnvelope(file, MAX_COVER_UPLOAD_BYTES);
  if (envelopeError) {
    return NextResponse.json({ error: envelopeError }, { status: 400 });
  }

  const uploaded = await uploadCoverToCdn({
    platformSlug,
    slug: targetSlug,
    fileBuffer: Buffer.from(await file.arrayBuffer()),
    mimeType: file.type,
  });
  if ("error" in uploaded) {
    return NextResponse.json({ error: uploaded.error }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    url: uploaded.coverUrl,
    width: uploaded.width,
    height: uploaded.height,
  });
}
