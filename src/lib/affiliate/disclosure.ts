export const AFFILIATE_DISCLOSURE_TEXT =
  "Disclosure: Algunos enlaces de esta página son enlaces de afiliado. Si compras a través de ellos, Region Atlas Games puede recibir una comisión sin coste adicional para ti. As an Amazon Associate I earn from qualifying purchases. Los precios y la disponibilidad pueden cambiar y deben confirmarse siempre en la tienda externa.";

export const AFFILIATE_DISCLOSURE_COMPACT_TEXT =
  "Enlaces afiliados · Podemos recibir una comisión sin coste adicional para ti.";

export function disclosureIsValid(text: string): boolean {
  return text.trim().startsWith("Disclosure:");
}
