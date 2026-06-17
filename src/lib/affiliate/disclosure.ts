export const AFFILIATE_DISCLOSURE_TEXT =
  "Disclosure: Algunos enlaces de esta página son enlaces de afiliado. Si compras a través de ellos, Region Atlas Games puede recibir una comisión sin coste adicional para ti. Los precios y la disponibilidad pueden cambiar y deben confirmarse siempre en la tienda externa.";

export function disclosureIsValid(text: string): boolean {
  return text.trim().startsWith("Disclosure:");
}

