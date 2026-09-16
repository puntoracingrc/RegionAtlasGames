import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { getPublicPersonView } from "@/lib/person-public-research";
import {
  normalizePersonPortrait,
  validatePersonPortraitUploadEnvelope,
} from "@/lib/person-portrait-upload";
import { saveAdminPersonPortrait } from "@/lib/person-portrait-storage";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const admin = await assertAdminApi();
  if (!admin) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { slug } = await params;
  const person = getPublicPersonView(slug);
  if (!person) {
    return NextResponse.json({ error: "Persona pública no encontrada." }, { status: 404 });
  }

  try {
    const form = await request.formData();
    if (form.get("rightsConfirmed") !== "1") {
      return NextResponse.json(
        { error: "Confirma que dispones de autorización o base legal para publicar la imagen." },
        { status: 400 },
      );
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Falta el archivo de retrato." }, { status: 400 });
    }
    const envelopeError = validatePersonPortraitUploadEnvelope(file);
    if (envelopeError) {
      return NextResponse.json({ error: envelopeError.error }, { status: envelopeError.status });
    }

    const normalized = await normalizePersonPortrait(Buffer.from(await file.arrayBuffer()));
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: normalized.status });
    }
    const portrait = await saveAdminPersonPortrait({
      slug,
      portrait: normalized,
      originalFilename: file.name,
      uploadedBy: admin.email,
    });

    revalidatePath("/persona");
    revalidatePath(`/persona/${slug}`);
    revalidatePath("/admin/entidades/personas");

    return NextResponse.json({
      portrait: {
        path: portrait.path,
        width: portrait.width,
        height: portrait.height,
        bytes: portrait.bytes,
        uploadedAt: portrait.uploadedAt,
      },
    });
  } catch (error) {
    console.error("[admin-person-portrait] upload failed", {
      slug,
      admin: admin.email,
      error,
    });
    return NextResponse.json(
      { error: "No se pudo guardar el retrato. Vuelve a intentarlo en unos instantes." },
      { status: 503 },
    );
  }
}
