import coverRemoteById from "../../data/cover-remote-by-id.json";

const remoteMap = coverRemoteById as Record<string, string>;

function coversCdnBase(): string | null {
  const base = process.env.NEXT_PUBLIC_COVERS_BASE_URL?.trim();
  return base ? base.replace(/\/$/, "") : null;
}

function isProductionDeploy(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

/**
 * URL servible en prod y local.
 * - Remoto (PriceCharting / Museo) primero: estable en Vercel y evita symlink local
 * - Local: /covers/... (symlink al disco externo) si no hay remoto
 * - CDN opcional: NEXT_PUBLIC_COVERS_BASE_URL + ruta local
 */
export function getCoverSrc(
  coverUrl: string | null | undefined,
  catalogId?: string | null,
): string | null {
  const remote = catalogId ? remoteMap[catalogId] : undefined;

  if (coverUrl?.startsWith("http://") || coverUrl?.startsWith("https://")) {
    return coverUrl;
  }

  if (remote) {
    return remote;
  }

  if (!coverUrl) {
    return null;
  }

  if (coverUrl.startsWith("/covers/")) {
    const cdn = coversCdnBase();
    if (cdn) {
      return `${cdn}${coverUrl}`;
    }
    if (isProductionDeploy()) {
      return null;
    }
    return coverUrl;
  }

  return coverUrl;
}

export function hasCoverRemoteFallback(catalogId: string): boolean {
  return Boolean(remoteMap[catalogId]);
}
