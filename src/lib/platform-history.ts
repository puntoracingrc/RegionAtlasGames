import platformHistoryData from "../../data/research/platform-history/platforms.json";
import type {
  CompanyPlatformHistoryLink,
  CompanyGenealogyLink,
  PlatformHistory,
  PlatformHistoryData,
  PlatformHardwareGroupId,
} from "./platform-history-types";
import { PLATFORM_HARDWARE_GROUPS } from "./platform-history-types";

const data = platformHistoryData as PlatformHistoryData;
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

export function getPlatformHistoryData(): PlatformHistoryData {
  return data;
}
