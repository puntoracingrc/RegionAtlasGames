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
