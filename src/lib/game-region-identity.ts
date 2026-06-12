import type { CatalogGame, GameDetails } from "./types";
import { getRegionDisplay } from "./region-display";

export type RegionSignal = {
  id: string;
  label: string;
  value: string;
  hint?: string;
  suggests?: string;
};

export type RegionIdentitySummary = {
  editionLabel: string;
  signals: RegionSignal[];
  physicalChecks: string[];
  referenceNote: string | null;
};

const MUSEUM_SEGMENT_REGION: Record<string, string> = {
  japon: "Japón",
  japan: "Japón",
  pal: "PAL Europa",
  usa: "USA",
  europe: "PAL Europa",
  espana: "PAL España",
  spain: "PAL España",
};

function museumPathRegion(museumPath: string | null | undefined): string | null {
  if (!museumPath) return null;
  const parts = museumPath.toLowerCase().split("/").filter(Boolean);
  for (const part of parts) {
    if (MUSEUM_SEGMENT_REGION[part]) return MUSEUM_SEGMENT_REGION[part];
  }
  return null;
}

function catalogIdRegionHint(catalogId: string): string | null {
  const id = catalogId.toLowerCase();
  if (id.includes("-japon-") || id.includes("-japan-")) return "Japón";
  if (id.includes("-pal-")) return "PAL Europa";
  if (id.includes("-usa-")) return "USA";
  if (id.includes("-espana-") || id.includes("-spain-")) return "PAL España";
  return null;
}

function interpretReference(
  ref: string,
  platformSlug: string,
): { suggests: string; hint: string } | null {
  const r = ref.trim().toUpperCase();
  if (!r) return null;

  if (/^HDR-/i.test(r)) {
    return { suggests: "Japón", hint: "Prefijo HDR: catálogo Sega Japón (Dreamcast/Saturn)." };
  }
  if (/^T-\d+[GM]$/i.test(r)) {
    return { suggests: "Japón", hint: "Código T-…G/M: edición japonesa Sega (cartucho/CD)." };
  }
  if (/^T-\d+D-/i.test(r) || (/^T-/i.test(r) && /-\d{2}$/.test(r))) {
    return { suggests: "PAL Europa", hint: "Código T-…D o sufijo -50/-61: edición PAL europea Sega." };
  }
  if (/^T-\d+N$/i.test(r)) {
    return { suggests: "USA", hint: "Código T-…N: edición NTSC norteamericana Sega." };
  }
  if (/^MK-\d+-\d+$/i.test(r)) {
    return { suggests: "PAL Europa", hint: "Código MK-…-50: distribución PAL Europa (Sega/Nintendo)." };
  }
  if (/^SLPS-/i.test(r)) {
    return { suggests: "Japón", hint: "SLPS: catálogo PlayStation Japón." };
  }
  if (/^SCPS-/i.test(r)) {
    return { suggests: "Japón", hint: "SCPS: catálogo Sony Japón." };
  }
  if (/^SLES-/i.test(r) || /^SLED-/i.test(r)) {
    return { suggests: "PAL Europa", hint: "SLES/SLED: catálogo PlayStation PAL Europa." };
  }
  if (/^SLUS-/i.test(r)) {
    return { suggests: "USA", hint: "SLUS: catálogo PlayStation USA." };
  }
  if (/^SHVC-/i.test(r)) {
    return { suggests: "Japón", hint: "SHVC: cartucho Super Famicom (Japón)." };
  }
  if (/^SNS[A-Z]?-/i.test(r) && !/^SNSP-/i.test(r)) {
    return { suggests: "Japón", hint: "SNS-: nomenclatura Super Famicom / SNES Japón." };
  }
  if (/^SNSP-/i.test(r)) {
    return { suggests: "PAL Europa", hint: "SNSP-: cartucho SNES PAL." };
  }
  if (/^NUS-/i.test(r)) {
    return { suggests: "PAL Europa", hint: "NUS- con sufijo europeo: cartucho N64 PAL." };
  }
  if (/^NEO-/i.test(r) && platformSlug.startsWith("neo")) {
    return { suggests: "Japón", hint: "NEO-: catálogo Neo Geo (edición Japón habitual)." };
  }

  return null;
}

function physicalChecksForRegion(region: string): string[] {
  const key = region.trim().toLowerCase();
  if (key === "japón" || key === "japan") {
    return [
      "Carátula con kanji/kana y logotipos en japonés.",
      "Referencia T-/HDR-/SLPS/SHVC en etiqueta o lomo del estuche.",
      "Manual y textos legales en japonés; clasificación CERO en PlayStation.",
    ];
  }
  if (key === "pal españa" || key === "españa") {
    return [
      "Carátula con textos en castellano (título, contraportada, clasificación).",
      "Manual en español y distribuidor local en contraportada.",
      "Código de barras 4-004xxx (España) cuando aparece en la edición local.",
    ];
  }
  if (key === "pal europa") {
    return [
      "Multilingüe (EN/FR/DE/IT…) y clasificación PEGI/BBFC/USK en contraportada.",
      "Logo «PAL» o «EUR» en carátula lateral; sin NTSC-USA.",
      "Referencia regional europea (p. ej. T-…D-50, SNSP-, SLES-).",
    ];
  }
  if (key === "usa") {
    return [
      "Carátula NTSC-USA (ESRB, «Only for sale in USA/Canada»).",
      "Código SLUS (PlayStation) o T-…N (Sega).",
      "Manual y textos legales en inglés americano.",
    ];
  }
  return ["Comprueba carátula, manual y código en el lomo o contraportada."];
}

function pushSignal(signals: RegionSignal[], signal: RegionSignal): void {
  if (signals.some((s) => s.id === signal.id)) return;
  signals.push(signal);
}

export function buildGameRegionIdentity(
  game: CatalogGame,
  details?: GameDetails | null,
): RegionIdentitySummary {
  const editionLabel = getRegionDisplay(game.region).label;
  const signals: RegionSignal[] = [];
  let referenceNote: string | null = null;

  pushSignal(signals, {
    id: "catalog-edition",
    label: "Edición en catálogo",
    value: editionLabel,
    hint: "Cada ficha es una edición concreta (PAL ES, PAL EU, USA o Japón), no el juego genérico.",
  });

  const museumFromGame = museumPathRegion(game.museumPath);
  const museumFromDetails = museumPathRegion(details?.museumPath);
  const museumRegion = game.museumRegion?.replace(/-/g, " ") ?? null;

  if (museumFromGame || museumFromDetails) {
    pushSignal(signals, {
      id: "museum-path",
      label: "Ficha museo (región)",
      value: museumFromGame ?? museumFromDetails ?? "—",
      suggests: museumFromGame ?? museumFromDetails ?? undefined,
      hint: "La ruta del museo separa ediciones por región (/japon/, /pal/, /usa/).",
    });
  }

  if (museumRegion) {
    pushSignal(signals, {
      id: "museum-region",
      label: "Segmento museo",
      value: museumRegion,
      suggests: MUSEUM_SEGMENT_REGION[museumRegion.toLowerCase().replace(/\s+/g, "")],
      hint: "Metadato interno alineado con la edición regional.",
    });
  }

  const idHint = catalogIdRegionHint(game.id);
  if (idHint) {
    pushSignal(signals, {
      id: "catalog-id",
      label: "Identificador catálogo",
      value: game.id,
      suggests: idHint,
      hint: "El slug incluye la región para distinguir ediciones con el mismo título.",
    });
  }

  const ref = details?.reference?.trim();
  if (ref) {
    const parsed = interpretReference(ref, game.platformSlug);
    pushSignal(signals, {
      id: "product-reference",
      label: "Referencia producto",
      value: ref,
      suggests: parsed?.suggests,
      hint: parsed?.hint ?? "Código impreso en carátula, cartucho o CD.",
    });
    if (parsed) {
      referenceNote = parsed.hint;
      if (parsed.suggests && parsed.suggests !== editionLabel) {
        referenceNote += ` La referencia apunta a ${parsed.suggests}; la ficha cataloga ${editionLabel}.`;
      }
    }
  }

  if (details?.releaseDate) {
    const isSpanishDate = /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i.test(
      details.releaseDate,
    );
    pushSignal(signals, {
      id: "release-date",
      label: "Fecha de lanzamiento",
      value: details.releaseDate,
      suggests: isSpanishDate ? "PAL España" : undefined,
      hint: isSpanishDate
        ? "Formato de fecha en español: habitual en fichas de edición europea/española."
        : "Compara con la ventana de salida de tu edición (JP suele ser la primera).",
    });
  }

  if (game.pcRegion && !game.pcRegion.toLowerCase().includes("multiregión")) {
    pushSignal(signals, {
      id: "pricecharting-region",
      label: "Ref. PriceCharting",
      value: game.pcRegion,
      hint: "Referencia externa; puede no coincidir con la edición concreta del catálogo.",
    });
  }

  return {
    editionLabel,
    signals,
    physicalChecks: physicalChecksForRegion(game.region),
    referenceNote,
  };
}

export function regionSignalsAgree(summary: RegionIdentitySummary): boolean {
  const edition = summary.editionLabel;
  return summary.signals.every((s) => !s.suggests || s.suggests === edition);
}
