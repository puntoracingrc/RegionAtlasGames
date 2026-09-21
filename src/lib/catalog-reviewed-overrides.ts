import type { CatalogGame, CatalogPhysicalReleaseGroup } from "./types";

const NEXT_LEVEL_ID = "ps3-usa-this-is-the-next-level";
const NEXT_LEVEL_ALIAS_ID = "ps3-usa-3d-logo-and-demo-disc";
const GAMING_PACK_ID = "ps3-3d-gaming-pack";
const JIGOKU_STANDARD_ID = "ps3-japon-3rd-super-robot-wars-z-jigoku-hen";
const TENGOKU_STANDARD_ID = "ps3-japon-3rd-super-robot-wars-z-tengokuhen";

type ReviewedPs3PhysicalIdentity = {
  title: string;
  workId: string;
  physicalVariant: string;
  region: string;
  marketRegion: CatalogGame["marketRegion"];
  releaseGroup: Pick<
    CatalogPhysicalReleaseGroup,
    "id" | "label" | "barcode" | "productCodes" | "serial" | "notes"
  >;
};

const reviewedPs3PhysicalIdentities: Record<string, ReviewedPs3PhysicalIdentity> = {
  "ps3-007-blood-stone": {
    title: "007 Blood Stone",
    workId: "007-blood-stone",
    physicalVariant: "Standard",
    region: "PAL España",
    marketRegion: "ES",
    releaseGroup: {
      id: "ps3:007-blood-stone:standard:01-es",
      label: "Estándar · España",
      barcode: "5030917091667",
      productCodes: ["BLES-01017"],
      serial: "BLES-01017",
      notes: ["Edición retail española; las demás cajas regionales cuelgan de esta misma familia Standard."],
    },
  },
  "ps3-usa-007-blood-stone": {
    title: "007 Blood Stone",
    workId: "007-blood-stone",
    physicalVariant: "Standard",
    region: "NTSC USA",
    marketRegion: "US",
    releaseGroup: {
      id: "ps3:007-blood-stone:standard:02-us",
      label: "Estándar · Estados Unidos",
      barcode: "047875837157",
      productCodes: ["BLUS-30289"],
      serial: "BLUS-30289",
      notes: ["Edición retail norteamericana de la familia Standard."],
    },
  },
  "ps3-007-blood-stone-not-for-resale": {
    title: "007 Blood Stone",
    workId: "007-blood-stone",
    physicalVariant: "Promo / Not For Resale",
    region: "PAL Europa",
    marketRegion: null,
    releaseGroup: {
      id: "ps3:007-blood-stone:promo-not-for-resale:01-europe",
      label: "Promo / Not For Resale · Europa",
      barcode: null,
      productCodes: ["BLES-01017"],
      serial: "BLES-01017",
      notes: ["Disco promocional europeo marcado PROMO ONLY / NOT FOR RESALE; su aparición en España no demuestra una tirada española."],
    },
  },
  "ps3-usa-007-legends": {
    title: "007 Legends",
    workId: "007-legends",
    physicalVariant: "Standard",
    region: "NTSC USA",
    marketRegion: "US",
    releaseGroup: {
      id: "ps3:007-legends:standard:01-us",
      label: "Estándar · Estados Unidos",
      barcode: "047875844667",
      productCodes: ["BLUS-30983"],
      serial: "BLUS-30983",
      notes: ["Edición retail norteamericana; las variantes regionales permanecen dentro de una única familia Standard."],
    },
  },
  "ps3-007-quantum-of-solace": {
    title: "007 Quantum of Solace",
    workId: "007-quantum-of-solace",
    physicalVariant: "Standard",
    region: "PAL España",
    marketRegion: "ES",
    releaseGroup: {
      id: "ps3:007-quantum-of-solace:standard:01-es",
      label: "Estándar · España",
      barcode: "5030917058264",
      productCodes: ["BLES-00406"],
      serial: "BLES-00406",
      notes: ["Edición retail española con packaging documentado en español."],
    },
  },
  "ps3-usa-007-quantum-of-solace": {
    title: "007 Quantum of Solace",
    workId: "007-quantum-of-solace",
    physicalVariant: "Standard",
    region: "NTSC USA",
    marketRegion: "US",
    releaseGroup: {
      id: "ps3:007-quantum-of-solace:standard:02-us",
      label: "Estándar · Estados Unidos",
      barcode: "047875832695",
      productCodes: ["BLUS-30198"],
      serial: "BLUS-30198",
      notes: ["Edición retail norteamericana de la familia Standard."],
    },
  },
  "ps3-007-quantum-of-solace-collector%27s-edition": {
    title: "007 Quantum of Solace",
    workId: "007-quantum-of-solace",
    physicalVariant: "Collector's Edition",
    region: "PAL Europa",
    marketRegion: null,
    releaseGroup: {
      id: "ps3:007-quantum-of-solace:collectors-edition:01-europe",
      label: "Collector's Edition · Europa",
      barcode: null,
      productCodes: ["BLES-00411"],
      serial: "BLES-00411",
      notes: ["La presencia de español en el disco no demuestra packaging específico de España; se conserva como edición europea."],
    },
  },
  "ps3-usa-007-quantum-of-solace-collector-s-edition": {
    title: "007 Quantum of Solace",
    workId: "007-quantum-of-solace",
    physicalVariant: "Collector's Edition",
    region: "NTSC USA",
    marketRegion: "US",
    releaseGroup: {
      id: "ps3:007-quantum-of-solace:collectors-edition:02-us",
      label: "Collector's Edition · Estados Unidos",
      barcode: "047875834859",
      productCodes: ["BLUS-30199"],
      serial: "BLUS-30199",
      notes: ["Collector's Edition norteamericana con disco e identificadores propios."],
    },
  },
  "ps3-007-quantum-of-solace-not-for-resale": {
    title: "007 Quantum of Solace",
    workId: "007-quantum-of-solace",
    physicalVariant: "Promo / Not For Resale",
    region: "PAL Europa",
    marketRegion: null,
    releaseGroup: {
      id: "ps3:007-quantum-of-solace:promo-not-for-resale:01-europe",
      label: "Promo / Not For Resale · Europa",
      barcode: null,
      productCodes: ["BLES-00406"],
      serial: "BLES-00406",
      notes: ["Promo europea marcada NOT FOR RESALE; no se atribuye a España sin evidencia de una tirada nacional."],
    },
  },
  "ps3-usa-007-quantum-of-solace-tshirt-bundle": {
    title: "007 Quantum of Solace",
    workId: "007-quantum-of-solace",
    physicalVariant: "T-Shirt Bundle",
    region: "NTSC USA",
    marketRegion: "US",
    releaseGroup: {
      id: "ps3:007-quantum-of-solace:t-shirt-bundle:01-us",
      label: "T-Shirt Bundle · Estados Unidos",
      barcode: "047875835191",
      productCodes: ["BLUS-30237"],
      serial: "BLUS-30237",
      notes: ["Bundle retail norteamericano con camiseta; es un producto físico distinto de la edición Standard."],
    },
  },
};

const reviewedSuperRobotWarsZ = {
  [JIGOKU_STANDARD_ID]: {
    title: "3rd Super Robot Wars Z: Jigoku-hen",
    workId: "3rd-super-robot-wars-z-jigoku-hen",
    physicalVariant: "Standard",
    releaseGroup: {
      id: "ps3:3rd-super-robot-wars-z-jigoku-hen:standard:01-japan",
      label: "Estándar · Japón",
      barcode: "4560467043386",
      productCodes: ["BLJS-10256"],
      releaseDate: "2014-04-10",
      releaseDateContext: "Lanzamiento japonés",
      notes: [
        "La primera tirada podía incluir un código para el remake HD de Super Robot Wars y un escenario bonus.",
        "No se crea otra edición física: no se ha documentado un JAN o código exterior diferente para esa primera tirada.",
      ],
    },
  },
  [TENGOKU_STANDARD_ID]: {
    title: "3rd Super Robot Wars Z: Tengoku-hen",
    workId: "3rd-super-robot-wars-z-tengoku-hen",
    physicalVariant: "Standard",
    releaseGroup: {
      id: "ps3:3rd-super-robot-wars-z-tengoku-hen:standard:01-japan",
      label: "Estándar · Japón",
      barcode: "4560467047209",
      productCodes: ["BLJS-10299"],
      releaseDate: "2015-04-02",
      releaseDateContext: "Lanzamiento japonés",
      notes: [
        "Las primeras copias podían incluir un código para descargar 3rd Super Robot Wars Z: Rengoku-hen.",
        "Rengoku-hen es un bonus digital no vendido por separado; no cuenta como edición física ni como Blu-ray.",
      ],
    },
  },
} as const;

export function withReviewedCatalogOverride(game: CatalogGame): CatalogGame {
  const reviewedPs3PhysicalIdentity = reviewedPs3PhysicalIdentities[game.id];
  if (reviewedPs3PhysicalIdentity) {
    const releaseGroup = reviewedPs3PhysicalIdentity.releaseGroup;
    return {
      ...game,
      title: reviewedPs3PhysicalIdentity.title,
      titlePc: reviewedPs3PhysicalIdentity.title,
      region: reviewedPs3PhysicalIdentity.region,
      marketRegion: reviewedPs3PhysicalIdentity.marketRegion,
      regionalStatus: "resolved",
      workId: reviewedPs3PhysicalIdentity.workId,
      physicalVariant: reviewedPs3PhysicalIdentity.physicalVariant,
      physicalReleaseGroup: {
        ...releaseGroup,
        productCodes: [...(releaseGroup.productCodes ?? [])],
        notes: [...(releaseGroup.notes ?? [])],
        packagingLanguages: [],
        softwareLanguages: [],
        confidence: "CONFIRMED",
        coverUrl: game.coverUrl,
        ratingSystems: [],
        catalogNumber: null,
        boxCode: null,
        releaseDate: null,
        releaseDateContext: null,
        physicalContentStatus: "PHYSICAL_FULL_GAME",
        physicalProductType: "NATIVE_GAME_DISC",
        physicalContents: ["Disco Blu-ray de juego"],
        digitalContents: [],
        images: [],
      },
    };
  }

  const reviewedSuperRobotWarsEntry = reviewedSuperRobotWarsZ[game.id as keyof typeof reviewedSuperRobotWarsZ];
  if (reviewedSuperRobotWarsEntry) {
    return {
      ...game,
      title: reviewedSuperRobotWarsEntry.title,
      titlePc: reviewedSuperRobotWarsEntry.title,
      workId: reviewedSuperRobotWarsEntry.workId,
      physicalVariant: reviewedSuperRobotWarsEntry.physicalVariant,
      regionalStatus: "resolved",
      marketRegion: "JP",
      physicalReleaseGroup: {
        ...reviewedSuperRobotWarsEntry.releaseGroup,
        productCodes: [...reviewedSuperRobotWarsEntry.releaseGroup.productCodes],
        notes: [...reviewedSuperRobotWarsEntry.releaseGroup.notes],
        packagingLanguages: ["ja"],
        softwareLanguages: ["ja"],
        confidence: "CONFIRMED",
        coverUrl: game.coverUrl,
        ratingSystems: ["CERO B"],
        catalogNumber: null,
        serial: reviewedSuperRobotWarsEntry.releaseGroup.productCodes[0],
        boxCode: null,
        physicalContentStatus: "PHYSICAL_FULL_GAME",
        physicalProductType: "NATIVE_GAME_DISC",
        physicalContents: ["Disco Blu-ray de juego"],
        digitalContents: [],
        images: [],
      },
    };
  }

  if (game.id === NEXT_LEVEL_ALIAS_ID) {
    return {
      ...game,
      listingStatus: "excluded",
      workId: "this-is-the-next-level-3d-games-and-demo-disc",
    };
  }

  if (game.id === GAMING_PACK_ID) {
    return {
      ...game,
      region: "PAL Australia",
      physicalVariant: "Code in Box",
      workId: "3d-gaming-pack",
      regionalStatus: "resolved",
      marketRegion: "AU",
      physicalReleaseGroup: {
        id: "ps3:3d-gaming-pack:code-in-box:01-australia-voucher",
        label: "Australia · voucher",
        barcode: null,
        productCodes: [],
        packagingLanguages: [],
        softwareLanguages: [],
        confidence: "CONFIRMED",
        coverUrl: null,
        ratingSystems: [],
        catalogNumber: null,
        serial: null,
        boxCode: null,
        releaseDate: null,
        releaseDateContext: null,
        physicalContentStatus: "CODE_IN_BOX",
        physicalProductType: "DOWNLOAD_CODE_IN_BOX",
        physicalContents: ["Caja física", "Voucher/código de descarga"],
        digitalContents: [
          "WipEout HD 3D",
          "Super Stardust HD",
          "PAIN 3D",
          "MotorStorm: Pacific Rift 3D · demo",
        ],
        images: [],
        notes: [
          "La documentación de Sony y preservación identifica un voucher, no un Blu-ray.",
          "EAN y código de producto no localizados; venta retail independiente no demostrada.",
        ],
      },
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
