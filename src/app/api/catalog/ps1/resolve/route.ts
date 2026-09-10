import { NextResponse } from "next/server";
import { catalogGamePath } from "@/lib/catalog-path";
import { ps1SerialEvidence } from "@/lib/ps1-catalog";

export async function GET(request: Request) {
  const serial = new URL(request.url).searchParams.get("serial")?.trim() ?? "";
  if (!serial || serial.length > 64) {
    return NextResponse.json({ error: "Introduce un código PS1 de hasta 64 caracteres." }, { status: 400 });
  }
  const result = ps1SerialEvidence(serial);
  return NextResponse.json({
    platform: result.platform,
    serial: result.serial,
    physicalVariantResolved: result.physicalVariantResolved,
    candidates: result.candidates.map(({ game, edition }) => ({
      catalogId: game.id, title: game.title, url: catalogGamePath(game), edition: game.edition,
      regionFamily: game.regionFamily, marketRegion: game.marketRegion, regionCode: game.regionCode,
      languages: game.languages, canonicalSerials: game.canonicalSerials,
      workId: game.workId, serialScope: edition?.serialScope, identityScope: edition?.identityScope,
      components: edition?.components, languageEvidence: edition?.languages,
      sources: edition?.sources, fieldProvenance: edition?.fieldProvenance,
      sourceWarnings: edition?.sourceWarnings,
    })),
  }, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } });
}
