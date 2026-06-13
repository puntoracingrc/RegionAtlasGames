import { COVERS_PUBLIC_BASE_URL } from "./site-brand";

/**
 * Resuelve la URL pública de una portada.
 * Catálogo: `/covers/{plataforma}/{archivo}.jpg`
 * Producción y local: hosting Region Atlas (puntoracing.net) o override por env.
 */
export function getCoverSrc(
  coverUrl: string | null | undefined,
  _catalogId?: string | null,
): string | null {
  if (!coverUrl) {
    return null;
  }

  if (coverUrl.startsWith("http://") || coverUrl.startsWith("https://")) {
    return null;
  }

  if (coverUrl.startsWith("/covers/")) {
    const relative = coverUrl.slice("/covers/".length);
    return `${COVERS_PUBLIC_BASE_URL}/${relative}`;
  }

  return null;
}
