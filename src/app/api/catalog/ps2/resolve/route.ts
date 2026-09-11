import { NextResponse } from "next/server";
import { catalogGamePath } from "@/lib/catalog-path";
import { ps2SerialEvidence } from "@/lib/ps2-catalog";
import { ps2DocumentaryByCode } from "@/lib/ps2-documentary";

export async function GET(request: Request) {
  const serial = new URL(request.url).searchParams.get("serial")?.trim() ?? "";
  if (!serial || serial.length > 64) return NextResponse.json({ error: "Introduce un código PS2 de hasta 64 caracteres." }, { status: 400 });
  const result = ps2SerialEvidence(serial);
  const references = ps2DocumentaryByCode(serial);
  return NextResponse.json({ platform: "ps2", serial: result.serial, physicalVariantResolved: false,
    candidates: result.candidates.map(({ game, edition }) => ({ catalogId: game.id, title: game.title, url: catalogGamePath(game), edition: game.edition,
      regionFamily: game.regionFamily, marketRegion: game.marketRegion, regionCode: game.regionCode, languages: game.languages, canonicalSerials: game.canonicalSerials,
      components: edition?.components, languageEvidence: edition?.languages, sources: edition?.sources, sourceWarnings: edition?.sourceWarnings })),
    referenceCount: references.length,
    documentaryReferences: references.slice(0, 50).map(({ record, role }) => ({ id: record.id, title: record.title, role, sourceUrl: record.sourceUrl,
      codes: record.codes, barcodeReferences: record.barcodeReferences, accessoryCodes: record.accessoryCodes, family: record.family, market: record.market, languageEvidence: record.languages,
      editionLabels: record.editionLabels, reviewReasons: record.reviewReasons, warnings: record.warnings, findings: record.findings, physicalVariantResolved: false })),
    truncated: references.length > 50,
  }, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } });
}
