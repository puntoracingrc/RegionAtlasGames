import { decodeHtmlEntities } from "./decode-html-entities";

export function slugify(text: string): string {
  return decodeHtmlEntities(text)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "juego";
}
