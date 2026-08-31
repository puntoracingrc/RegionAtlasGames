export type AdminAiBatchItem = {
  pcId: number | null;
  catalogId?: string;
  title: string;
  platformSlug: string;
  region: string;
  status: "processed" | "skipped" | "error" | "dry-run";
  message: string;
  fieldsUpdated: string[];
  sources: string[];
  urls: string[];
  steamTags: string[];
  descriptionPreview: string | null;
  seoPreview: string | null;
};

export type AdminAiBatchReport = {
  scanned: number;
  selected: number;
  processed: number;
  saved: number;
  skipped: number;
  errors: number;
  dryRun: boolean;
  sourceCoverage: {
    steam: number;
    official: number;
    wikipedia: number;
    existing: number;
    other: number;
  };
  fieldCoverage: Record<string, number>;
  items: AdminAiBatchItem[];
};

export type AdminAiBatchQueueItem = {
  id: string;
  pcId: number | null;
  catalogId?: string;
  title: string;
  platformSlug: string;
  region: string;
  status: string;
  lastSeenAt: string;
};

function itemKey(item: Pick<AdminAiBatchItem, "catalogId" | "pcId">): string {
  return item.catalogId ? `catalog:${item.catalogId}` : `staging:${item.pcId}`;
}

export function createAdminAiBatchReport(
  scanned: number,
  dryRun: boolean,
): AdminAiBatchReport {
  return {
    scanned,
    selected: 0,
    processed: 0,
    saved: 0,
    skipped: 0,
    errors: 0,
    dryRun,
    sourceCoverage: {
      steam: 0,
      official: 0,
      wikipedia: 0,
      existing: 0,
      other: 0,
    },
    fieldCoverage: {},
    items: [],
  };
}

export function mergeAdminAiBatchReports(
  current: AdminAiBatchReport,
  incoming: AdminAiBatchReport,
): AdminAiBatchReport {
  const fieldCoverage = { ...current.fieldCoverage };
  for (const [field, count] of Object.entries(incoming.fieldCoverage)) {
    fieldCoverage[field] = (fieldCoverage[field] ?? 0) + count;
  }

  return {
    ...current,
    selected: current.selected + incoming.selected,
    processed: current.processed + incoming.processed,
    saved: current.saved + incoming.saved,
    skipped: current.skipped + incoming.skipped,
    errors: current.errors + incoming.errors,
    sourceCoverage: {
      steam: current.sourceCoverage.steam + incoming.sourceCoverage.steam,
      official: current.sourceCoverage.official + incoming.sourceCoverage.official,
      wikipedia: current.sourceCoverage.wikipedia + incoming.sourceCoverage.wikipedia,
      existing: current.sourceCoverage.existing + incoming.sourceCoverage.existing,
      other: current.sourceCoverage.other + incoming.sourceCoverage.other,
    },
    fieldCoverage,
    items: [...current.items, ...incoming.items],
  };
}

export function appendAdminAiBatchFailure(
  current: AdminAiBatchReport,
  game: AdminAiBatchQueueItem,
  message: string,
): AdminAiBatchReport {
  return {
    ...current,
    selected: current.selected + 1,
    errors: current.errors + 1,
    items: [
      ...current.items,
      {
        pcId: game.pcId,
        catalogId: game.catalogId,
        title: game.title,
        platformSlug: game.platformSlug,
        region: game.region,
        status: "error",
        message,
        fieldsUpdated: [],
        sources: [],
        urls: [],
        steamTags: [],
        descriptionPreview: null,
        seoPreview: null,
      },
    ],
  };
}

export function replaceAdminAiBatchItem(
  report: AdminAiBatchReport,
  incoming: AdminAiBatchItem,
): AdminAiBatchReport {
  const incomingKey = itemKey(incoming);
  const items = report.items.map((item) => (itemKey(item) === incomingKey ? incoming : item));
  if (!items.some((item) => itemKey(item) === incomingKey)) items.unshift(incoming);
  return { ...report, items };
}

export function describeAdminAiBatchResponseError(
  status: number,
  serverMessage?: string | null,
): string {
  if (serverMessage?.trim()) return serverMessage.trim();
  if (status === 504) {
    return "La ficha agotó el tiempo de procesamiento. Puedes relanzarla de forma individual.";
  }
  if (status === 502 || status === 503) {
    return "El servicio de IA no estaba disponible. Puedes relanzar esta ficha cuando se recupere.";
  }
  return `No se pudo procesar la ficha (HTTP ${status}).`;
}
