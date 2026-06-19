import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import {
  downloadAndUploadSagaBackgroundToCdn,
  uploadSagaBackgroundToCdn,
} from "@/lib/covers-upload";
import {
  DEFAULT_SERIES_BACKGROUND_OPACITY,
  DEFAULT_SERIES_BACKGROUND_READABILITY,
  updateAdminSeriesBackground,
} from "@/lib/admin-series-manager";

type Props = { params: Promise<{ slug: string }> };

export async function POST(req: Request, { params }: Props) {
  const admin = await assertAdminApi();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { slug } = await params;
  const contentType = req.headers.get("content-type") ?? "";

  let uploaded:
    | { ok: true; backgroundImageUrl: string }
    | { error: string };

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Falta la imagen." }, { status: 400 });
    }
    const arrayBuffer = await file.arrayBuffer();
    uploaded = await uploadSagaBackgroundToCdn({
      slug,
      fileBuffer: Buffer.from(arrayBuffer),
      mimeType: file.type,
    });
  } else {
    const body = await req.json().catch(() => ({}));
    const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl : "";
    uploaded = await downloadAndUploadSagaBackgroundToCdn({ slug, sourceUrl });
  }

  if ("error" in uploaded) {
    return NextResponse.json({ error: uploaded.error }, { status: 400 });
  }

  const result = await updateAdminSeriesBackground(
    slug,
    uploaded.backgroundImageUrl,
    DEFAULT_SERIES_BACKGROUND_OPACITY,
    DEFAULT_SERIES_BACKGROUND_READABILITY,
  );
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({
    ok: true,
    backgroundImageUrl: uploaded.backgroundImageUrl,
    series: result.series,
  });
}
