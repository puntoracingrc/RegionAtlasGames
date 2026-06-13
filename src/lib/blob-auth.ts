import { getVercelOidcToken } from "@vercel/functions/oidc";
import type { BlobAccessType } from "@vercel/blob";

type BlobAuthOptions = {
  access: BlobAccessType;
  token?: string;
  oidcToken?: string;
  storeId?: string;
};

export async function blobAuthOptions(
  access: BlobAccessType = "private",
): Promise<BlobAuthOptions> {
  const readWriteToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (readWriteToken) {
    return { access, token: readWriteToken };
  }

  const storeId = process.env.BLOB_STORE_ID?.trim();
  if (storeId && process.env.VERCEL) {
    const oidcToken = await getVercelOidcToken();
    return { access, oidcToken, storeId };
  }

  return { access };
}

export function blobAuthConfigured(): boolean {
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return true;
  if (process.env.BLOB_STORE_ID?.trim() && process.env.VERCEL) return true;
  return false;
}
