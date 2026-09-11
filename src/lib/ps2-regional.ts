import type { Ps1EditionDetails, Ps1GraphicReference } from "./ps1-regional";

export type Ps2Finding = {
  id: string;
  title: string;
  observation: string;
  engineRule: string;
  evidenceClass: string;
  evidence: Array<{ sourceId: string; sourceUrl: string }>;
};

/** Software territory and physical packaging remain different evidence scopes. */
export type Ps2EditionDetails = Omit<Ps1EditionDetails, "graphics"> & {
  graphics: Array<Ps1GraphicReference & {
    layout?: string;
    identifierDifference?: unknown;
    visualObservation?: Record<string, unknown> | null;
  }>;
  findings?: Ps2Finding[];
  accessoryCodes?: Array<{ raw: string; value: string; kind: string }>;
  productCodes?: Array<{ raw: string; value: string; kind: string }>;
};

/** Normalize only serial typography. SKU and suffixes retain their literal identity. */
export function normalizePs2Serial(value: string): string {
  return value.trim().toUpperCase().replace(/^(S[A-Z]{3})[-_. ]?(?=\d)/, "$1-");
}

export function ps2GraphicLabel(asset: Ps2EditionDetails["graphics"][number]): string {
  if (asset.layout === "listing_packaging_photo") return "Fotografía de portada y contraportada";
  if (asset.layout === "listing_front_photo") return "Fotografía de portada";
  if (asset.layout === "listing_back_photo") return "Fotografía de contraportada";
  if (asset.layout === "full_cover_candidate") return "Escaneo de carátula";
  return asset.roles.includes("front_cover") ? "Portada" : asset.roles.includes("back_cover") ? "Contraportada" : "Componente";
}
