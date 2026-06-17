import { del, get, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { blobAuthOptions } from "@/lib/blob-auth";

export async function GET() {
  const admin = await assertAdminApi();
  if (!admin) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const pathname = `region-atlas/diagnostics/blob-health-${Date.now()}.json`;

  try {
    const auth = await blobAuthOptions("private");
    await put(pathname, JSON.stringify({ ok: true, at: new Date().toISOString() }), {
      ...auth,
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    const read = await get(pathname, auth);
    await del(pathname, auth);

    return NextResponse.json({
      ok: true,
      readStatus: read?.statusCode ?? null,
      auth: {
        hasReadWriteToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim()),
        hasStoreId: Boolean(process.env.BLOB_STORE_ID?.trim()),
        hasOidcToken: Boolean(process.env.VERCEL_OIDC_TOKEN?.trim()),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        ok: false,
        error: message,
        auth: {
          hasReadWriteToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim()),
          hasStoreId: Boolean(process.env.BLOB_STORE_ID?.trim()),
          hasOidcToken: Boolean(process.env.VERCEL_OIDC_TOKEN?.trim()),
        },
      },
      { status: 503 },
    );
  }
}
