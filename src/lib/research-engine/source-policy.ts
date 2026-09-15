import type { ResearchClaimField, ResearchEvidenceKind } from "./types";

type SourceProfile = {
  kind: ResearchEvidenceKind;
  strength: number;
  supports: ResearchClaimField[];
};

const SOURCE_PROFILES: Array<{ hosts: string[]; profile: SourceProfile }> = [
  {
    hosts: ["regionatlas.games", "www.regionatlas.games"],
    profile: {
      kind: "OWN_SCAN",
      strength: 1,
      supports: ["physicalExistence", "platform", "edition", "barcode", "productCode", "market", "packagingLanguages", "contents"],
    },
  },
  {
    hosts: ["ubisoft.com", "www.ubisoft.com", "nintendo.com", "www.nintendo.com", "playstation.com", "www.playstation.com", "xbox.com", "www.xbox.com"],
    profile: {
      kind: "PUBLISHER",
      strength: 0.96,
      supports: ["physicalExistence", "physicalContentStatus", "releaseStatus", "platform", "edition", "contents", "softwareLanguages"],
    },
  },
  {
    hosts: ["redump.org", "redump.info", "serialstation.com", "www.serialstation.com", "dbox.tools", "no-intro.org", "datomatic.no-intro.org"],
    profile: {
      kind: "TECHNICAL_DATABASE",
      strength: 0.93,
      supports: ["platform", "productCode", "softwareLanguages", "physicalExistence", "contents"],
    },
  },
  {
    hosts: [
      "fnac.es", "www.fnac.es", "fnac.com", "www.fnac.com", "fnac.pt", "www.fnac.pt",
      "game.es", "www.game.es", "gamelife.it", "www.gamelife.it", "e.leclerc", "www.e.leclerc",
      "mediamarkt.es", "www.mediamarkt.es", "wog.ch", "www.wog.ch", "gamesmen.com.au", "www.gamesmen.com.au",
      "gamestop.com", "www.gamestop.com", "bestbuy.com", "www.bestbuy.com", "walmart.com", "www.walmart.com",
    ],
    profile: {
      kind: "RETAILER",
      strength: 0.8,
      supports: ["physicalExistence", "barcode", "market", "edition", "releaseStatus", "contents"],
    },
  },
  {
    hosts: ["gamefaqs.gamespot.com", "mobygames.com", "www.mobygames.com", "ogdb.eu", "www.ogdb.eu", "vgcollect.com", "www.vgcollect.com", "retroplace.com", "www.retroplace.com"],
    profile: {
      kind: "COLLECTOR_DATABASE",
      strength: 0.66,
      supports: ["physicalExistence", "barcode", "productCode", "market", "edition", "releaseStatus"],
    },
  },
  {
    hosts: ["ebay.com", "www.ebay.com", "ebay.es", "www.ebay.es", "ebay.co.uk", "www.ebay.co.uk", "todocoleccion.net", "www.todocoleccion.net"],
    profile: {
      kind: "MARKETPLACE",
      strength: 0.45,
      supports: ["physicalExistence", "barcode", "packagingLanguages", "contents"],
    },
  },
];

const FALLBACK_PROFILE: SourceProfile = {
  kind: "UNKNOWN",
  strength: 0.35,
  supports: [],
};

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, "");
}

export function sourceProfileForUrl(url: string | null | undefined): SourceProfile {
  if (!url) return FALLBACK_PROFILE;
  let host: string;
  try {
    host = normalizeHost(new URL(url).hostname);
  } catch {
    return FALLBACK_PROFILE;
  }

  for (const entry of SOURCE_PROFILES) {
    if (entry.hosts.some((candidate) => normalizeHost(candidate) === host)) return entry.profile;
  }
  return FALLBACK_PROFILE;
}

export function sourceCanSupportClaim(url: string | null | undefined, field: ResearchClaimField): boolean {
  return sourceProfileForUrl(url).supports.includes(field);
}

export function sourceStrengthForClaim(url: string | null | undefined, field: ResearchClaimField): number {
  const profile = sourceProfileForUrl(url);
  if (!profile.supports.includes(field)) return Math.min(profile.strength, 0.3);
  return profile.strength;
}

export function evidenceKindStrength(kind: ResearchEvidenceKind): number {
  switch (kind) {
    case "OWN_SCAN": return 1;
    case "PHYSICAL_SCAN": return 0.98;
    case "PUBLISHER": return 0.96;
    case "PLATFORM_HOLDER": return 0.94;
    case "TECHNICAL_DATABASE": return 0.93;
    case "RETAILER": return 0.8;
    case "COLLECTOR_DATABASE": return 0.66;
    case "MARKETPLACE": return 0.45;
    case "SEARCH_RESULT": return 0.3;
    default: return 0.25;
  }
}
