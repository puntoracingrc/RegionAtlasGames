/**
 * @vercel/blob get() interpolates a pathname into a delivery URL. Storage keys
 * are literal: %27 is three characters in a key, not an apostrophe, and #/?
 * must not become URL delimiters. Encode only the GET transport, never the
 * keys supplied to head(), put(), del(), or the catalog/receipt identifiers.
 */
export function blobReadPathname(pathname: string): string {
  return pathname.split("/").map(encodeURIComponent).join("/");
}
