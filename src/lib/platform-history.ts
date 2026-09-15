import platformHistoryData from "../../data/research/platform-history/platforms.json";
import playstation2HistoryData from "../../data/research/platform-history/platforms-ps2.json";
import playstation3HistoryData from "../../data/research/platform-history/platforms-ps3.json";
import playstation5HistoryData from "../../data/research/platform-history/platforms-ps5.json";
import pspHistoryData from "../../data/research/platform-history/platforms-psp.json";
import psVitaHistoryData from "../../data/research/platform-history/platforms-psvita.json";
import xboxHistoryData from "../../data/research/platform-history/platforms-xbox.json";
import xbox360HistoryData from "../../data/research/platform-history/platforms-xbox360.json";
import xboxOneHistoryData from "../../data/research/platform-history/platforms-xboxone.json";
import xboxSeriesHistoryData from "../../data/research/platform-history/platforms-xboxseries.json";
import neoGeoHistoryData from "../../data/research/platform-history/platforms-neogeo.json";
import neoGeoCdHistoryData from "../../data/research/platform-history/platforms-neogeocd.json";
import hyperNeoGeo64HistoryData from "../../data/research/platform-history/platforms-hyper-neogeo64.json";
import neoGeoPocketHistoryData from "../../data/research/platform-history/platforms-neogeopocket.json";
import type {
  CompanyPlatformHistoryLink,
  CompanyGenealogyLink,
  PlatformHistory,
  PlatformHistoryData,
  PlatformHardwareGroupId,
} from "./platform-history-types";
import { PLATFORM_HARDWARE_GROUPS } from "./platform-history-types";

const baseData = platformHistoryData as PlatformHistoryData;
const playstation2Data = playstation2HistoryData as PlatformHistoryData;
const playstation3Data = playstation3HistoryData as PlatformHistoryData;
const playstation5Data = playstation5HistoryData as PlatformHistoryData;
const pspData = pspHistoryData as PlatformHistoryData;
const psVitaData = psVitaHistoryData as PlatformHistoryData;
const xboxData = xboxHistoryData as PlatformHistoryData;
const xbox360Data = xbox360HistoryData as PlatformHistoryData;
const xboxOneData = xboxOneHistoryData as PlatformHistoryData;
const xboxSeriesData = xboxSeriesHistoryData as PlatformHistoryData;
const neoGeoData = neoGeoHistoryData as PlatformHistoryData;
const neoGeoCdData = neoGeoCdHistoryData as PlatformHistoryData;
const hyperNeoGeo64Data = hyperNeoGeo64HistoryData as PlatformHistoryData;
const neoGeoPocketData = neoGeoPocketHistoryData as PlatformHistoryData;
const overlays = [
  playstation2Data,
  pspData,
  playstation3Data,
  psVitaData,
  playstation5Data,
  xboxData,
  xbox360Data,
  xboxOneData,
  xboxSeriesData,
  neoGeoData,
  neoGeoCdData,
  hyperNeoGeo64Data,
  neoGeoPocketData,
];
const data: PlatformHistoryData = {
  version: Math.max(baseData.version, ...overlays.map((overlay) => overlay.version)),
  generatedAt: neoGeoPocketData.generatedAt,
  platforms: [
    ...new Map(
      [
        ...baseData.platforms,
        ...playstation2Data.platforms,
        ...pspData.platforms,
        ...playstation3Data.platforms,
        ...psVitaData.platforms,
        ...playstation5Data.platforms,
        ...xboxData.platforms,
        ...xbox360Data.platforms,
        ...xboxOneData.platforms,
        ...xboxSeriesData.platforms,
        ...neoGeoData.platforms,
        ...neoGeoCdData.platforms,
        ...hyperNeoGeo64Data.platforms,
        ...neoGeoPocketData.platforms,
      ].map((history) => [history.platformSlug, history]),
    ).values(),
  ],
};
const histories = new Map(
  data.platforms.map((history) => [history.platformSlug, history]),
);

const platformNames = new Map(
  data.platforms.map((history) => [history.platformSlug, history.title]),
);

export function getPlatformHistory(platformSlug: string): PlatformHistory | undefined {
  return histories.get(platformSlug);
}

export function getPlatformHistorySlugs(): string[] {
  return data.platforms.map((history) => history.platformSlug);
}

export function platformHistoryPath(
  platformSlug: string,
  options: { hardware?: PlatformHardwareGroupId; section?: string } = {},
): string {
  const query = options.hardware ? `?hardware=${encodeURIComponent(options.hardware)}` : "";
  const fragment = options.section ? `#${encodeURIComponent(options.section)}` : "";
  return `/historia-plataformas/${encodeURIComponent(platformSlug)}${query}${fragment}`;
}

export function getPlatformHardwareGroup(
  platformSlug: string,
  itemId: string,
): PlatformHardwareGroupId | undefined {
  const item = histories
    .get(platformSlug)
    ?.hardware.find((candidate) => candidate.id === itemId);
  if (!item) return undefined;
  return PLATFORM_HARDWARE_GROUPS.find((group) => group.kinds.includes(item.kind))?.id;
}

export function parsePlatformHardwareGroup(
  value: string | undefined,
): PlatformHardwareGroupId | undefined {
  return PLATFORM_HARDWARE_GROUPS.find((group) => group.id === value)?.id;
}

export function getCompanyPlatformHistoryLinks(
  companySlug: string,
): CompanyPlatformHistoryLink[] {
  return data.platforms.flatMap((history) =>
    history.companies
      .filter((company) => company.companySlug === companySlug)
      .map((company) => ({
        ...company,
        platformSlug: history.platformSlug,
        platformName: platformNames.get(history.platformSlug) ?? history.platformSlug,
      })),
  );
}

export function getCompanyGenealogyRelations(companySlug: string): CompanyGenealogyLink[] {
  return data.platforms.flatMap((history) =>
    history.genealogies
      .filter(
        (relation) =>
          relation.sourceCompanySlug === companySlug ||
          relation.targetCompanySlug === companySlug,
      )
      .map((relation) => ({ ...relation, platformSlug: history.platformSlug })),
  );
}

export function getEditorialCompanyIdentity(
  companySlug: string,
): { slug: string; name: string } | undefined {
  for (const history of data.platforms) {
    const company = history.companies.find((candidate) => candidate.companySlug === companySlug);
    if (company) return { slug: company.companySlug, name: company.companyName };

    const genealogy = history.genealogies.find(
      (candidate) =>
        candidate.sourceCompanySlug === companySlug || candidate.targetCompanySlug === companySlug,
    );
    if (genealogy?.sourceCompanySlug === companySlug) {
      return { slug: companySlug, name: genealogy.sourceCompanyName };
    }
    if (genealogy?.targetCompanySlug === companySlug && genealogy.targetCompanyName) {
      return { slug: companySlug, name: genealogy.targetCompanyName };
    }

    for (const architecture of history.architecture ?? []) {
      const partner = architecture.partners.find((candidate) => candidate.companySlug === companySlug);
      if (partner) return { slug: companySlug, name: partner.companyName };
    }
  }
  return undefined;
}

export function getPlatformHistoryData(): PlatformHistoryData {
  return data;
}
