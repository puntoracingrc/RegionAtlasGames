import { decodeEntityText } from "./entity-normalize";

/** Clave normalizada para agrupar variantes de género (idioma, sinónimos). */
export function normalizeGenreKey(name: string): string {
  let text = decodeEntityText(name).toLowerCase();
  text = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return text.replace(/\s+/g, " ");
}

export function pickGenreDisplayName(names: Iterable<string>): string {
  const unique = [...new Set([...names].map(decodeEntityText).filter(Boolean))];
  if (unique.length === 0) return "";
  const preferred = unique.find((name) => /[áéíóúñ]/i.test(name)) ?? unique[0];
  return preferred;
}
