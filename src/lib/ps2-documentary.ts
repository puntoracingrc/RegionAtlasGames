import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { Ps2Finding } from "./ps2-regional";
import type { Ps1EditionDetails } from "./ps1-regional";
import { normalizePs2Serial } from "./ps2-regional";

export type Ps2SourceRecord = {
  id: string; title: string; names: string[]; sourceUrl: string; sourceHash: string;
  family: string; market: { code: string; market: string; label: string } | null;
  barcodeReferences: Array<{ digits: string; scope: string; sourceUrl: string; editionLabel?: string; sourceDisclaimsCertainty?: boolean }>;
  codes: string[]; accessoryCodes: Array<{ value: string; kind: string }>;
  languages: NonNullable<Ps1EditionDetails["languages"]>;
  editionLabels: string[]; releaseDate: Ps1EditionDetails["regionalReleaseDate"];
  metadata: Record<string, string>; reviewReasons: string[]; warnings: string[];
  graphics: Array<{ assetId: string; roles: string[]; label: string | null; sourceImageReference: string; url: string | null }>;
  findings: Ps2Finding[]; physicalVariantResolved: false;
};

let records: Ps2SourceRecord[] | undefined;
let byCode: Map<string, Ps2SourceRecord[]> | undefined;

export function ps2SourceRecords(): Ps2SourceRecord[] {
  records ??= JSON.parse(gunzipSync(readFileSync(path.join(process.cwd(), "data", "ps2-source-knowledge.json.gz"))).toString("utf8")).records;
  return records!;
}

/** An accessory code retrieves its own role; it never becomes a disc identifier. */
export function ps2DocumentaryByCode(value: string) {
  const code = normalizePs2Serial(value);
  if (!byCode) {
    byCode = new Map();
    for (const record of ps2SourceRecords()) {
      for (const id of new Set([...record.codes, ...record.accessoryCodes.map((c) => c.value), ...record.barcodeReferences.map((b) => b.digits)].map(normalizePs2Serial))) {
        byCode.set(id, [...(byCode.get(id) ?? []), record]);
      }
    }
  }
  return (byCode.get(code) ?? []).map((record) => ({ record,
    role: record.codes.some((c) => normalizePs2Serial(c) === code) ? "edition_code" as const : record.barcodeReferences.some((b) => b.digits === code) ? "barcode_reference" as const : "accessory_code" as const }));
}
