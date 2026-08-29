import { blobAuthConfigured } from "./blob-auth";
import {
  classifyCollectors,
  classifyHygieneAudit,
  classifyRunnerQueue,
  classifyStagingAutomation,
  classifyWorkflowRun,
  type AdminHealthSignal,
  type AdminWorkflowRun,
  worstAdminHealthSignal,
} from "./admin-operations-health";
import { priceWorkerPublicBaseUrl } from "./admin-price-collect";
import { readCatalogStagingIndex } from "./catalog-staging-storage";
import type { CatalogStagingIndex } from "./catalog-staging-types";
import type { CatalogEntityAuditStatus } from "./admin-catalog-hygiene";
import type { LocalGameRunnerJob } from "./local-game-runner-jobs";
import { readPriceSourceSettings } from "./price-source-settings";

const GITHUB_REPOSITORY = "puntoracingrc/RegionAtlasGames";
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPOSITORY}`;

type WorkflowApiResponse = {
  workflow_runs?: Array<{
    id?: number;
    name?: string;
    status?: string;
    conclusion?: string | null;
    event?: string;
    created_at?: string;
    updated_at?: string;
    html_url?: string;
    head_sha?: string;
  }>;
};

type RunnerQueueDocument = {
  jobs?: LocalGameRunnerJob[];
};

export type AdminOverviewWorkflowKey = "quality" | "dailyPrices" | "ebayCampaign";

export type AdminOperationsOverview = {
  generatedAt: string;
  overall: AdminHealthSignal;
  sections: Record<string, AdminHealthSignal>;
  workflows: Record<AdminOverviewWorkflowKey, AdminHealthSignal>;
  signals: AdminHealthSignal[];
  stats: {
    stagingTotal: number | null;
    stagingReviewPending: number | null;
    pendingEnrichment: number | null;
    runnerPending: number | null;
    runnerRunning: number | null;
    collectorsTotal: number | null;
    collectorsManualActive: number | null;
    collectorsRotationActive: number | null;
  };
  diagnostic: string;
};

async function fetchPublicJson<T>(url: string, revalidateSeconds: number): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "RegionAtlasGames-admin-health/1.0",
      },
      next: { revalidate: revalidateSeconds },
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function readLatestWorkflowRun(fileName: string): Promise<AdminWorkflowRun | null> {
  const response = await fetchPublicJson<WorkflowApiResponse>(
    `${GITHUB_API}/actions/workflows/${encodeURIComponent(fileName)}/runs?per_page=1&branch=main`,
    300,
  );
  const run = response?.workflow_runs?.[0];
  if (!run?.id || !run.updated_at || !run.html_url) return null;
  return {
    id: run.id,
    name: run.name || fileName,
    status: run.status || "unknown",
    conclusion: run.conclusion ?? null,
    event: run.event || "unknown",
    createdAt: run.created_at || run.updated_at,
    updatedAt: run.updated_at,
    url: run.html_url,
    headSha: run.head_sha || "unknown",
  };
}

async function readRunnerJobs(): Promise<LocalGameRunnerJob[] | null> {
  const base = priceWorkerPublicBaseUrl();
  if (!base) return null;
  const queue = await fetchPublicJson<RunnerQueueDocument>(
    `${base}/app/data/admin/local-game-runner-jobs.json`,
    60,
  );
  return Array.isArray(queue?.jobs) ? queue.jobs : null;
}

async function readHygieneStatus(): Promise<CatalogEntityAuditStatus | null> {
  const base = priceWorkerPublicBaseUrl();
  if (!base) return null;
  return fetchPublicJson<CatalogEntityAuditStatus>(
    `${base}/app/data/admin/catalog-html-entity-audit-status.json`,
    180,
  );
}

function valueOrNull<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

function pendingEnrichment(index: CatalogStagingIndex | null): number | null {
  if (!index) return null;
  return Object.values(index.byPlatform).reduce((total, stats) => total + stats.pendingEnrich, 0);
}

function pendingStagingReview(index: CatalogStagingIndex | null): number | null {
  if (!index) return null;
  return Object.values(index.byPlatform).reduce(
    (total, stats) => total + stats.pendingEnrich + stats.enriched,
    0,
  );
}

function inline(value: unknown): string {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

function signalLine(prefix: string, signal: AdminHealthSignal): string[] {
  return [
    `${prefix}.level=${signal.level}`,
    `${prefix}.label=${inline(signal.label)}`,
    `${prefix}.detail=${inline(signal.detail)}`,
    `${prefix}.at=${signal.at ?? "unknown"}`,
    `${prefix}.url=${signal.href ?? "none"}`,
  ];
}

function overallSignal(signals: AdminHealthSignal[]): AdminHealthSignal {
  const worst = worstAdminHealthSignal(signals);
  const actions = signals.filter((signal) => signal.level === "action").length;
  const watches = signals.filter((signal) => signal.level === "watch").length;
  const unknowns = signals.filter((signal) => signal.level === "unknown").length;
  if (actions > 0) {
    return {
      level: "action",
      label: `${actions} aviso(s) requieren revisión`,
      detail: watches > 0 ? `Además hay ${watches} señal(es) de seguimiento.` : "Abre los bloques rojos para ver el origen.",
    };
  }
  if (watches > 0) {
    return {
      level: "watch",
      label: `${watches} señal(es) para vigilar`,
      detail: "No hay un fallo crítico confirmado, pero conviene revisar estos estados.",
    };
  }
  if (unknowns > 0) {
    return {
      level: "unknown",
      label: `${unknowns} estado(s) sin confirmar`,
      detail: "No se detecta un fallo, pero alguna fuente externa no ha podido consultarse.",
    };
  }
  if (worst.level === "paused") {
    return {
      level: "paused",
      label: "Operación estable con tareas pausadas",
      detail: "Los servicios disponibles responden; algunas automatizaciones están detenidas intencionadamente.",
    };
  }
  return {
    level: worst.level,
    label: worst.level === "ok" ? "Operación estable" : "Estado parcialmente desconocido",
    detail: worst.level === "ok" ? "No hay avisos operativos visibles." : "Alguna fuente externa no ha podido consultarse.",
  };
}

export async function getAdminOperationsOverview(now = new Date()): Promise<AdminOperationsOverview> {
  const [indexResult, sourcesResult, runnerResult, hygieneResult, qualityResult, dailyResult, ebayResult] =
    await Promise.allSettled([
      readCatalogStagingIndex(),
      readPriceSourceSettings(),
      readRunnerJobs(),
      readHygieneStatus(),
      readLatestWorkflowRun("quality.yml"),
      readLatestWorkflowRun("daily-price-ingest.yml"),
      readLatestWorkflowRun("ebay-ps4-regional-campaign.yml"),
    ]);

  const index = valueOrNull(indexResult);
  const sourceSettings = valueOrNull(sourcesResult);
  const jobs = valueOrNull(runnerResult);
  const hygieneStatus = valueOrNull(hygieneResult);
  const sources = sourceSettings
    ? [...Object.values(sourceSettings.sources), ...sourceSettings.customSources]
    : null;
  const collectorStats = sources
    ? {
        total: sources.length,
        manualActive: sources.filter((source) => source.enabledManual ?? source.enabled).length,
        rotationActive: sources.filter((source) => source.enabledRotation ?? source.enabled).length,
      }
    : null;

  const stagingSignal = classifyStagingAutomation(index, now);
  const runnerSignal = classifyRunnerQueue(jobs, now);
  const hygieneSignal = classifyHygieneAudit(hygieneStatus, now);
  const collectorsSignal = classifyCollectors(collectorStats);
  const workflows = {
    quality: classifyWorkflowRun(valueOrNull(qualityResult), {
      label: "Calidad y despliegue",
      now,
    }),
    dailyPrices: classifyWorkflowRun(valueOrNull(dailyResult), {
      label: "Precios diarios",
      expectedWithinHours: 36,
      now,
    }),
    ebayCampaign: classifyWorkflowRun(valueOrNull(ebayResult), {
      label: "Campaña eBay",
      expectedWithinHours: 10,
      now,
    }),
  };
  const durableStorage = blobAuthConfigured();
  const storageSignal: AdminHealthSignal = durableStorage || !process.env.VERCEL
    ? {
        level: "ok",
        label: durableStorage ? "Blob disponible" : "Disco local disponible",
        detail: "La persistencia requerida está configurada para este entorno.",
      }
    : {
        level: "action",
        label: "Falta almacenamiento duradero",
        detail: "Vercel no debe depender del disco efímero para datos operativos.",
      };

  const priceSignal = worstAdminHealthSignal([
    workflows.dailyPrices,
    workflows.ebayCampaign,
    collectorsSignal,
  ]);
  const systemSignal = worstAdminHealthSignal([
    storageSignal,
    stagingSignal,
    runnerSignal,
    workflows.quality,
  ]);
  const signals = [
    workflows.quality,
    workflows.dailyPrices,
    workflows.ebayCampaign,
    stagingSignal,
    runnerSignal,
    hygieneSignal,
    collectorsSignal,
    storageSignal,
  ];
  const overall = overallSignal(signals);
  const stats = {
    stagingTotal: index?.pcIds.length ?? null,
    stagingReviewPending: pendingStagingReview(index),
    pendingEnrichment: pendingEnrichment(index),
    runnerPending: jobs?.filter((job) => job.status === "pending").length ?? null,
    runnerRunning: jobs?.filter((job) => job.status === "running").length ?? null,
    collectorsTotal: collectorStats?.total ?? null,
    collectorsManualActive: collectorStats?.manualActive ?? null,
    collectorsRotationActive: collectorStats?.rotationActive ?? null,
  };
  const generatedAt = now.toISOString();
  const diagnostic = [
    "REGION_ATLAS_ADMIN_OVERVIEW_V1",
    "CODEX_HANDOFF_CONTEXT_V1",
    "scope=admin_operations_and_automation",
    "project=regionatlas.games",
    "local_repo=/Users/macbookpro14/Projects/pal-es-market",
    "production=https://www.regionatlas.games",
    "github=https://github.com/puntoracingrc/RegionAtlasGames",
    "rules=read-only-first; never expose tokens; never mutate catalog/prices/worker settings without explicit approval",
    "deploy_flow=branch -> commit -> push -> PR -> checks -> merge -> main deployment -> verify production",
    "verify_after_deploy=/admin 200 with admin auth; admin APIs reject unauthenticated access; confirm main SHA and production domain",
    "worker_model=Vercel schedules lightweight jobs; GitHub Actions runs hosted collectors; the external PC executes queued heavy jobs when online",
    "data_safety=preserve catalog, prices, history and review queues; do not enable paused collectors as a diagnostic step",
    "if_blocked=report exact signal and URL; keep changes reversible; do not force destructive rollback",
    `generatedAt=${generatedAt}`,
    `overall.level=${overall.level}`,
    `overall.label=${inline(overall.label)}`,
    `deployment.sha=${process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || "local"}`,
    `environment=${process.env.VERCEL_ENV || process.env.NODE_ENV || "local"}`,
    `staging.total=${stats.stagingTotal ?? "unknown"}`,
    `staging.reviewPending=${stats.stagingReviewPending ?? "unknown"}`,
    `staging.pendingEnrichment=${stats.pendingEnrichment ?? "unknown"}`,
    `runner.pending=${stats.runnerPending ?? "unknown"}`,
    `runner.running=${stats.runnerRunning ?? "unknown"}`,
    `collectors.total=${stats.collectorsTotal ?? "unknown"}`,
    `collectors.manualActive=${stats.collectorsManualActive ?? "unknown"}`,
    `collectors.rotationActive=${stats.collectorsRotationActive ?? "unknown"}`,
    ...signalLine("workflow.quality", workflows.quality),
    ...signalLine("workflow.dailyPrices", workflows.dailyPrices),
    ...signalLine("workflow.ebayCampaign", workflows.ebayCampaign),
    ...signalLine("automation.staging", stagingSignal),
    ...signalLine("automation.pcWorker", runnerSignal),
    ...signalLine("catalog.hygiene", hygieneSignal),
    ...signalLine("collectors", collectorsSignal),
    ...signalLine("storage", storageSignal),
  ].join("\n");

  return {
    generatedAt,
    overall,
    sections: {
      "/admin/cola": {
        level: stats.stagingReviewPending ? "watch" : "ok",
        label: stats.stagingReviewPending ? `${stats.stagingReviewPending} por revisar` : "Cola vacía",
        detail: stats.stagingReviewPending
          ? "Hay fichas en staging pendientes de decisión."
          : "No hay fichas en revisión.",
      },
      "/admin/higiene": hygieneSignal,
      "/admin/ia": stagingSignal,
      "/admin/precios": priceSignal,
      "/admin/sistema": systemSignal,
    },
    workflows,
    signals,
    stats,
    diagnostic,
  };
}
