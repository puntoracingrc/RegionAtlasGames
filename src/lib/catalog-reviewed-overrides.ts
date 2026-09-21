import type { CatalogGame } from "./types";

const NEXT_LEVEL_ID = "ps3-usa-this-is-the-next-level";
const NEXT_LEVEL_ALIAS_ID = "ps3-usa-3d-logo-and-demo-disc";

export function withReviewedCatalogOverride(game: CatalogGame): CatalogGame {
  if (game.id === NEXT_LEVEL_ALIAS_ID) {
    return {
      ...game,
      listingStatus: "excluded",
      workId: "this-is-the-next-level-3d-games-and-demo-disc",
    };
  }

  if (game.id !== NEXT_LEVEL_ID) return game;
  return {
    ...game,
    title: "This Is the Next Level: 3D Games and Demo Disc",
    titlePc: "This Is the Next Level: 3D Games and Demo Disc",
    region: "Brasil",
    physicalVariant: "Recopilatorio promocional",
    workId: "this-is-the-next-level-3d-games-and-demo-disc",
    regionalStatus: "resolved",
    marketRegion: "BR",
    physicalReleaseGroup: {
      id: "ps3:this-is-the-next-level-3d-games-and-demo-disc:recopilatorio-promocional:01-brasil-packaging-americas",
      label: "Brasil · packaging Américas",
      barcode: null,
      productCodes: [],
      packagingLanguages: [],
      softwareLanguages: [],
      confidence: "CONFIRMED",
      coverUrl: null,
      ratingSystems: ["ESRB"],
      catalogNumber: null,
      serial: "BCUS-98274",
      boxCode: null,
      releaseDate: null,
      releaseDateContext: null,
      physicalContentStatus: "PHYSICAL_FULL_GAME",
      physicalProductType: "NATIVE_GAME_DISC",
      physicalContents: [
        "WipEout HD · completo",
        "Super Stardust HD · completo",
        "MotorStorm: Pacific Rift 3D · demo",
        "PAIN 3D · contenido parcial/demo",
      ],
      digitalContents: [],
      images: [],
      notes: [
        "3D Logo and Demo Disc se conserva como nombre alternativo.",
        "BCUS-98274 es un Title ID interno extraído del disco; no consta impreso en caja o disco.",
        "Sin EAN/UPC retail documentado.",
        "Brasil es la atribución física más fuerte; USA queda como distribución no confirmada.",
      ],
    },
  };
}
