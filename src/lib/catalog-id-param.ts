export function resolveEncodedCatalogIdParam(
  value: string,
  exists: (candidate: string) => boolean,
): string {
  const exact = value.trim();
  if (!exact || exists(exact)) return exact;

  try {
    const decoded = decodeURIComponent(exact);
    if (decoded !== exact && exists(decoded)) return decoded;
  } catch {
    // A malformed percent escape is still a valid opaque legacy identifier.
  }
  return exact;
}
