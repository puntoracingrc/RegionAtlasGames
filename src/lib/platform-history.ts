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
import segaEarlyHistoryData from "../../data/research/platform-history/platforms-sega-early.json";
import segaMegaDriveHistoryData from "../../data/research/platform-history/platforms-sega-megadrive.json";
import segaGameGearHistoryData from "../../data/research/platform-history/platforms-sega-gamegear.json";
import segaSaturnHistoryData from "../../data/research/platform-history/platforms-sega-saturn.json";
import segaDreamcastHistoryData from "../../data/research/platform-history/platforms-sega-dreamcast.json";
import nintendoGameAndWatchHistoryData from "../../data/research/platform-history/platforms-nintendo-gameandwatch.json";
import nintendoNesHistoryData from "../../data/research/platform-history/platforms-nintendo-nes.json";
import nintendoGameBoyHistoryData from "../../data/research/platform-history/platforms-nintendo-gameboy.json";
import nintendoSnesHistoryData from "../../data/research/platform-history/platforms-nintendo-snes.json";
import nintendoVirtualBoyHistoryData from "../../data/research/platform-history/platforms-nintendo-virtualboy.json";
import nintendoN64HistoryData from "../../data/research/platform-history/platforms-nintendo-n64.json";
import nintendoGbaHistoryData from "../../data/research/platform-history/platforms-nintendo-gba.json";
import nintendoGameCubeHistoryData from "../../data/research/platform-history/platforms-nintendo-gamecube.json";
import nintendoDsHistoryData from "../../data/research/platform-history/platforms-nintendo-ds.json";
import nintendoWiiHistoryData from "../../data/research/platform-history/platforms-nintendo-wii.json";
import nintendo3dsHistoryData from "../../data/research/platform-history/platforms-nintendo-3ds.json";
import nintendoWiiUHistoryData from "../../data/research/platform-history/platforms-nintendo-wiiu.json";
import nintendoSwitchHistoryData from "../../data/research/platform-history/platforms-nintendo-switch.json";
import nintendoSwitch2HistoryData from "../../data/research/platform-history/platforms-nintendo-switch2.json";
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
const segaEarlyData = segaEarlyHistoryData as PlatformHistoryData;
const segaMegaDriveData = segaMegaDriveHistoryData as PlatformHistoryData;
const segaGameGearData = segaGameGearHistoryData as PlatformHistoryData;
const segaSaturnData = segaSaturnHistoryData as PlatformHistoryData;
const segaDreamcastData = segaDreamcastHistoryData as PlatformHistoryData;
const nintendoGameAndWatchData = nintendoGameAndWatchHistoryData as PlatformHistoryData;
const nintendoNesData = nintendoNesHistoryData as PlatformHistoryData;
const nintendoGameBoyData = nintendoGameBoyHistoryData as PlatformHistoryData;
const nintendoSnesData = nintendoSnesHistoryData as PlatformHistoryData;
const nintendoVirtualBoyData = nintendoVirtualBoyHistoryData as PlatformHistoryData;
const nintendoN64Data = nintendoN64HistoryData as PlatformHistoryData;
const nintendoGbaData = nintendoGbaHistoryData as PlatformHistoryData;
const nintendoGameCubeData = nintendoGameCubeHistoryData as PlatformHistoryData;
const nintendoDsData = nintendoDsHistoryData as PlatformHistoryData;
const nintendoWiiData = nintendoWiiHistoryData as PlatformHistoryData;
const nintendo3dsData = nintendo3dsHistoryData as PlatformHistoryData;
const nintendoWiiUData = nintendoWiiUHistoryData as PlatformHistoryData;
const nintendoSwitchData = nintendoSwitchHistoryData as PlatformHistoryData;
const nintendoSwitch2Data = nintendoSwitch2HistoryData as PlatformHistoryData;
const data: PlatformHistoryData = {
  version: Math.max(
    baseData.version,
    playstation2Data.version,
    playstation3Data.version,
    playstation5Data.version,
    pspData.version,
    psVitaData.version,
    xboxData.version,
    xbox360Data.version,
    xboxOneData.version,
    xboxSeriesData.version,
    segaEarlyData.version,
    segaMegaDriveData.version,
    segaGameGearData.version,
    segaSaturnData.version,
    segaDreamcastData.version,
    nintendoGameAndWatchData.version,
    nintendoNesData.version,
    nintendoGameBoyData.version,
    nintendoSnesData.version,
    nintendoVirtualBoyData.version,
    nintendoN64Data.version,
    nintendoGbaData.version,
    nintendoGameCubeData.version,
    nintendoDsData.version,
    nintendoWiiData.version,
    nintendo3dsData.version,
    nintendoWiiUData.version,
    nintendoSwitchData.version,
    nintendoSwitch2Data.version,
  ),
  generatedAt: nintendoSwitch2Data.generatedAt,
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
        ...segaEarlyData.platforms,
        ...segaMegaDriveData.platforms,
        ...segaGameGearData.platforms,
        ...segaSaturnData.platforms,
        ...segaDreamcastData.platforms,
        ...nintendoGameAndWatchData.platforms,
        ...nintendoNesData.platforms,
        ...nintendoGameBoyData.platforms,
        ...nintendoSnesData.platforms,
        ...nintendoVirtualBoyData.platforms,
        ...nintendoN64Data.platforms,
        ...nintendoGbaData.platforms,
        ...nintendoGameCubeData.platforms,
        ...nintendoDsData.platforms,
        ...nintendoWiiData.platforms,
        ...nintendo3dsData.platforms,
        ...nintendoWiiUData.platforms,
        ...nintendoSwitchData.platforms,
        ...nintendoSwitch2Data.platforms,
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
