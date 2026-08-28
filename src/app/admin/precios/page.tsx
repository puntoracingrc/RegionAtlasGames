import Link from "next/link";
import { readFileSync } from "fs";
import path from "path";
import { AdminGameReleaseDiscoveryPanel } from "@/components/admin/admin-game-release-discovery-panel";
import { AdminLocalGameRunnerPanel } from "@/components/admin/admin-local-game-runner-panel";
import { AdminMarketCollectionPanel } from "@/components/admin/admin-market-collection-panel";
import { AdminPriceCoverageTable } from "@/components/admin/admin-price-coverage-table";
import { AdminPriceReviewPanel } from "@/components/admin/admin-price-review-panel";
import { AdminPriceSourceSettingsPanel } from "@/components/admin/admin-price-source-settings-panel";
import { AdminStatTile, adminToneClass } from "@/components/admin/admin-visual";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import { getAdminPriceDashboard, type AdminPriceSyncRow } from "@/lib/admin-price-dashboard";
import {
  adminPriceCollectUnavailableReason,
  isAdminPriceCollectAvailable,
  type AdminPriceJobMeta,
} from "@/lib/admin-price-collect";
import type { AdminPriceCronAttempt } from "@/lib/admin-price-cron-log";
import { listPriceReviewItems } from "@/lib/admin-price-review";
import { listLocalGameRunnerJobs, localGameRunnerTokenConfigured } from "@/lib/local-game-runner-jobs";
import { listMarketResearchBatches } from "@/lib/market-research-batches";
import { readPriceSourceSettings } from "@/lib/price-source-settings";

export const dynamic = "force-dynamic";

type RecentLabel = "hoy" | "ayer" | "reciente" | "antiguo";
type CoverageSort = "updated-desc" | "updated-asc" | "coverage-desc" | "coverage-asc";
type PriceSyncHealth = {
  label: string;
  tone: "green" | "amber" | "rose" | "neutral";
  helper: string;
};
type PriceSourceOption = {
  value: string;
  label: string;
  helper?: string;
};
type EbayCampaignTotals = {
  catalogGames?: number;
  completed?: number;
  matched?: number;
  noMatch?: number;
  deferred?: number;
  pending?: number;
};
type EbayCampaignRegion = {
  key?: string;
  label?: string;
  catalogRegion?: string;
  marketScope?: string;
  originLabel?: string;
  total?: number;
  completed?: number;
  matched?: number;
  deferred?: number;
  pending?: number;
};
type EbayCampaignPlatform = {
  platformSlug?: string;
  platformName?: string;
  status?: string;
  currentRegion?: string | null;
  updatedAt?: string | null;
  totals?: EbayCampaignTotals;
  regions?: EbayCampaignRegion[];
};
type EbayGlobalCampaign = {
  status?: string;
  currentPlatform?: string | null;
  currentPlatformName?: string | null;
  currentRegion?: string | null;
  updatedAt?: string | null;
  totals?: EbayCampaignTotals;
  estimatedRunsRemaining?: number;
  estimatedDaysRemaining?: number;
  platforms?: EbayCampaignPlatform[];
  coverCandidates?: { games?: number; images?: number; platforms?: number };
  log?: Array<{ at?: string; level?: string; message?: string; platformSlug?: string; region?: string }>;
};

type EbayCoverQueueGame = {
  catalogId?: string;
  title?: string;
  platformSlug?: string;
  region?: string;
  lastSeenAt?: string;
  candidates?: Array<{
    id?: string;
    imageUrl?: string;
    productUrl?: string | null;
    confidence?: number | null;
  }>;
};

function readEbayGlobalCampaign(): EbayGlobalCampaign {
  try {
    return JSON.parse(
      readFileSync(path.join(process.cwd(), "data", "ebay-regional-campaigns", "global.json"), "utf8"),
    ) as EbayGlobalCampaign;
  } catch {
    try {
      const catalog = JSON.parse(readFileSync(path.join(process.cwd(), "data", "catalog.json"), "utf8")) as Array<{
        platformSlug?: string;
        region?: string;
        listingStatus?: string;
      }>;
      const platformDefinitions = JSON.parse(
        readFileSync(path.join(process.cwd(), "data", "platforms.json"), "utf8"),
      ) as Array<{ slug?: string; name?: string }>;
      const ps4 = JSON.parse(
        readFileSync(path.join(process.cwd(), "data", "ebay-regional-campaigns", "ps4.json"), "utf8"),
      ) as { status?: string; currentRegion?: string | null; updatedAt?: string | null; totals?: EbayCampaignTotals; regions?: Record<string, EbayCampaignRegion>; log?: EbayGlobalCampaign["log"] };
      const active = catalog.filter((game) => game.platformSlug && game.listingStatus !== "excluded");
      const names = new Map(platformDefinitions.map((platform) => [platform.slug, platform.name]));
      const slugs = [...new Set(active.map((game) => String(game.platformSlug)))];
      const platforms = slugs.map((slug) => {
        const games = active.filter((game) => game.platformSlug === slug);
        const ps4Totals = slug === "ps4" ? ps4.totals ?? {} : {};
        const completed = ps4Totals.completed ?? 0;
        const deferred = ps4Totals.deferred ?? 0;
        return {
          platformSlug: slug,
          platformName: names.get(slug) ?? slug,
          status: slug === "ps4" ? ps4.status : "ready",
          currentRegion: slug === "ps4" ? ps4.currentRegion : null,
          updatedAt: slug === "ps4" ? ps4.updatedAt : null,
          totals: {
            catalogGames: games.length,
            completed,
            matched: ps4Totals.matched ?? 0,
            noMatch: ps4Totals.noMatch ?? 0,
            deferred,
            pending: games.length - completed - deferred,
          },
          regions: slug === "ps4" ? Object.values(ps4.regions ?? {}) : [],
        } satisfies EbayCampaignPlatform;
      });
      const completed = ps4.totals?.completed ?? 0;
      const deferred = ps4.totals?.deferred ?? 0;
      const pending = active.length - completed - deferred;
      return {
        status: ps4.status ?? "ready",
        currentPlatform: "ps4",
        currentPlatformName: names.get("ps4") ?? "PlayStation 4",
        currentRegion: ps4.currentRegion,
        updatedAt: ps4.updatedAt,
        totals: {
          catalogGames: active.length,
          completed,
          matched: ps4.totals?.matched ?? 0,
          noMatch: ps4.totals?.noMatch ?? 0,
          deferred,
          pending,
        },
        estimatedRunsRemaining: Math.ceil(pending / 50),
        estimatedDaysRemaining: Math.ceil(pending / 200),
        platforms,
        log: ps4.log ?? [],
      };
    } catch {
      return {};
    }
  }
}

function readEbayCoverQueue(): { totals: { games?: number; images?: number; platforms?: number }; games: EbayCoverQueueGame[] } {
  try {
    const queue = JSON.parse(
      readFileSync(path.join(process.cwd(), "data", "ebay-regional-campaigns", "cover-candidates.json"), "utf8"),
    ) as { totals?: { games?: number; images?: number; platforms?: number }; games?: Record<string, EbayCoverQueueGame> };
    return {
      totals: queue.totals ?? {},
      games: Object.values(queue.games ?? {}).sort((a, b) => String(b.lastSeenAt ?? "").localeCompare(String(a.lastSeenAt ?? ""))),
    };
  } catch {
    return { totals: {}, games: [] };
  }
}

function readPriceSourcePlatformOptions(): PriceSourceOption[] {
  try {
    const platforms = JSON.parse(readFileSync(path.join(process.cwd(), "data", "platforms.json"), "utf8")) as Array<{
      slug?: string;
      name?: string;
      shortName?: string;
    }>;
    return platforms
      .filter((platform) => platform.slug && platform.name)
      .map((platform) => ({
        value: String(platform.slug),
        label: String(platform.name),
        helper: platform.shortName && platform.shortName !== platform.name ? String(platform.shortName) : undefined,
      }));
  } catch {
    return [];
  }
}

function readPriceSourceRegionOptions(): PriceSourceOption[] {
  try {
    const catalog = JSON.parse(readFileSync(path.join(process.cwd(), "data", "catalog.json"), "utf8")) as Array<{
      region?: string;
    }>;
    const regions = Array.from(
      new Set(catalog.map((game) => String(game.region ?? "").trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b, "es"));
    return regions.map((region) => ({ value: region, label: region }));
  } catch {
    return [];
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(new Date(value));
}

function formatNextRun(value: string | null | undefined): string {
  if (!value) return "Sin hora programada";
  const date = new Date(value);
  const madridDay = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Madrid",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  const today = madridDay(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = madridDay(tomorrowDate);
  const day = madridDay(date);
  const prefix = day === today ? "Hoy" : day === tomorrow ? "Mañana" : formatDate(value);
  const time = new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  }).format(date);
  return `${prefix} a las ${time}`;
}

function dayLabel(value: string | null | undefined): RecentLabel {
  if (!value) return "antiguo";
  const date = new Date(value);
  const now = new Date();
  const madridDay = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Madrid",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  const today = madridDay(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);
  const yesterday = madridDay(yesterdayDate);
  const day = madridDay(date);
  if (day === today) return "hoy";
  if (day === yesterday) return "ayer";
  const ageMs = now.getTime() - date.getTime();
  return ageMs < 1000 * 60 * 60 * 24 * 7 ? "reciente" : "antiguo";
}

function toneForLabel(label: RecentLabel): "green" | "amber" | "neutral" {
  if (label === "hoy") return "green";
  if (label === "ayer" || label === "reciente") return "amber";
  return "neutral";
}

function statusTone(status: AdminPriceJobMeta["status"]): "green" | "amber" | "rose" {
  if (status === "done") return "green";
  if (status === "running") return "amber";
  return "rose";
}

function cronStatusTone(status: "started" | "done" | "blocked" | "skipped" | "error"): "green" | "amber" | "rose" | "neutral" {
  if (status === "started" || status === "done") return "green";
  if (status === "skipped") return "amber";
  if (status === "blocked" || status === "error") return "rose";
  return "neutral";
}

function cronStatusLabel(status: "started" | "done" | "blocked" | "skipped" | "error"): string {
  if (status === "started") return "lanzado";
  if (status === "done") return "terminado";
  if (status === "skipped") return "saltado";
  if (status === "blocked") return "bloqueado";
  return "error";
}

function aiStatusTone(enabled: boolean | null): "green" | "amber" | "rose" {
  if (enabled === true) return "green";
  if (enabled === false) return "rose";
  return "amber";
}

function isHostingRotationAttempt(attempt: AdminPriceCronAttempt): boolean {
  return attempt.userAgent === "1and1-hosting-cron" || attempt.id.startsWith("hosting-");
}

function isTodayOrYesterday(value: string | null | undefined): boolean {
  const label = dayLabel(value);
  return label === "hoy" || label === "ayer";
}

function jobTitle(job: AdminPriceJobMeta): string {
  if (job.targets?.length) return `Lote de ${job.targets.length} objetivo(s)`;
  if (job.platformSlug) return `Plataforma ${job.platformSlug}${job.region ? ` · ${job.region}` : ""}`;
  return `Juego ${job.catalogId ?? "—"}`;
}

function jobTriggerLabel(job: AdminPriceJobMeta): string {
  return job.trigger === "automatic" ? "automático" : "manual";
}

function jobProgress(job: AdminPriceJobMeta): { done: number; total: number; failed: number; pct: number } | null {
  if (!job.targets?.length) return null;
  const total = job.targets.length;
  const failed = job.failedTargets?.length ?? 0;
  const done = (job.completedTargets?.length ?? 0) + failed;
  return {
    done,
    total,
    failed,
    pct: Math.min(100, Math.round((done / total) * 100)),
  };
}

function updatedBySource(row: AdminPriceSyncRow): { label: string; value: number }[] {
  return [
    ["P2P total", row.gamesUpdated],
    ["Wallapop", row.wallapopGamesUpdated],
    ["eBay", row.ebayGamesUpdated],
    ["Vinted", row.vintedGamesUpdated],
    ["CeX", row.cexGamesUpdated],
    ["JGO", row.jgoGamesUpdated],
    ["Chollo", row.cholloGamesUpdated],
    ["Kaoto", row.kaotoGamesUpdated],
    ["TodoConsolas", row.tcnsGamesUpdated],
    ["TodoColeccion", row.tcGamesUpdated],
  ]
    .map(([label, value]) => ({ label: String(label), value: Number(value ?? 0) }))
    .filter((item) => item.value > 0);
}

function splitSourceLabel(source: string | null | undefined): string[] {
  if (!source) return [];
  return source
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function sourceKey(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function realSourceLabels(row: AdminPriceSyncRow): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  const add = (label: string) => {
    const clean = label.trim();
    if (!clean || clean === "P2P total") return;
    const key = sourceKey(clean);
    if (seen.has(key)) return;
    seen.add(key);
    labels.push(clean);
  };

  splitSourceLabel(row.source).forEach(add);
  updatedBySource(row).forEach((source) => add(source.label));
  return labels;
}

function syncHealth(row: AdminPriceSyncRow): PriceSyncHealth {
  const updates = Number(row.gamesUpdated ?? 0);
  const targeted = Number(row.gamesTargeted ?? 0);
  const coverage = Number(row.coveragePct ?? 0);
  const sources = realSourceLabels(row);

  if (!row.lastSyncAt) {
    return {
      label: "Sin sincronizar",
      tone: "rose",
      helper: "No hay fecha guardada para esta plataforma.",
    };
  }
  if (sources.length === 0) {
    return {
      label: "Sin fuente real",
      tone: "rose",
      helper: "El worker no dejó fuentes identificables.",
    };
  }
  if (updates <= 0) {
    return {
      label: "Sin datos nuevos",
      tone: "amber",
      helper: "La rueda pasó, pero no actualizó juegos.",
    };
  }
  if (coverage >= 60 || (targeted > 0 && updates / targeted >= 0.6)) {
    return {
      label: "Fuerte",
      tone: "green",
      helper: `${updates} actualizados con buena cobertura.`,
    };
  }
  return {
    label: "Parcial",
    tone: "amber",
    helper: `${updates} actualizados; conviene revisar cobertura.`,
  };
}

function sourceLeaderboard(rows: AdminPriceSyncRow[]): { label: string; value: number }[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    for (const source of updatedBySource(row)) {
      if (source.label === "P2P total") continue;
      totals.set(source.label, (totals.get(source.label) ?? 0) + source.value);
    }
  }
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "es"))
    .slice(0, 8);
}

function priceListProgressLabel(row: AdminPriceSyncRow): string | null {
  if (
    row.priceListCoverageBeforePct == null ||
    row.priceListCoverageAfterPct == null ||
    row.priceListPricedBefore == null ||
    row.priceListPricedAfter == null ||
    row.priceListTotalGames == null
  ) {
    return null;
  }
  const delta = Number(row.priceListCoverageDeltaPct ?? 0);
  const deltaLabel = delta > 0 ? `+${delta.toLocaleString("es-ES")}` : delta.toLocaleString("es-ES");
  return `${row.priceListPricedBefore}/${row.priceListTotalGames} → ${row.priceListPricedAfter}/${row.priceListTotalGames} juegos con precio (${deltaLabel} puntos)`;
}

function latestPriceListProgress(rows: AdminPriceSyncRow[]): AdminPriceSyncRow | null {
  return rows.find((row) => priceListProgressLabel(row)) ?? null;
}

function priceListProgressSummary(row: AdminPriceSyncRow): string {
  const delta = Number(row.priceListCoverageDeltaPct ?? 0);
  const deltaLabel = Math.abs(delta).toLocaleString("es-ES", { maximumFractionDigits: 1 });
  if (delta > 0) {
    return `Hemos mejorado un ${deltaLabel}% de juegos con precio en ${row.platformName}.`;
  }
  if (delta < 0) {
    return `La última recolecta dejó ${deltaLabel}% menos juegos con precio en ${row.platformName}.`;
  }
  return `La última recolecta mantuvo igual la cobertura de juegos con precio en ${row.platformName}.`;
}

function normalizeCoverageSort(value: string | string[] | undefined): CoverageSort {
  const current = Array.isArray(value) ? value[0] : value;
  if (current === "updated-asc" || current === "coverage-desc" || current === "coverage-asc") return current;
  return "updated-desc";
}

export default async function AdminPricesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const coverageSort = normalizeCoverageSort(params?.coverageSort);
  const [dashboard, priceSourceSettings, priceReviewItems, localGameJobs, marketBatches] = await Promise.all([
    getAdminPriceDashboard(20),
    readPriceSourceSettings(),
    listPriceReviewItems(500),
    listLocalGameRunnerJobs(20),
    listMarketResearchBatches(12),
  ]);
  const platformOptions = readPriceSourcePlatformOptions();
  const regionOptions = readPriceSourceRegionOptions();
  const canCollectPrices = isAdminPriceCollectAvailable();
  const ebayCampaign = readEbayGlobalCampaign();
  const ebayCoverQueue = readEbayCoverQueue();
  const ebayTotals = ebayCampaign.totals ?? {};
  const ebayTotal = ebayTotals.catalogGames ?? 0;
  const ebayCompleted = ebayTotals.completed ?? 0;
  const ebayProgress = ebayTotal > 0 ? Math.round((ebayCompleted / ebayTotal) * 1000) / 10 : 0;
  const currentEbayPlatform = ebayCampaign.platforms?.find((platform) => platform.platformSlug === ebayCampaign.currentPlatform);
  const freshRows = dashboard.recentSyncs.filter((row) => {
    return isTodayOrYesterday(row.lastSyncAt);
  });
  const rotationAttempts = dashboard.cronAttempts.filter(isHostingRotationAttempt);
  const lastRotationDone = rotationAttempts.find((attempt) => attempt.status === "done");
  const recentRotationAttempts = rotationAttempts.filter((attempt) => isTodayOrYesterday(attempt.at));
  const recentSourceTotals = sourceLeaderboard(dashboard.recentSyncs);
  const latestProgress = latestPriceListProgress(dashboard.recentSyncs);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className={`${adminToneClass("status")} min-w-0 lg:col-span-2`}>
          <PanelTitle eyebrow="Rotación automática">Estado de recopilación</PanelTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            <AdminStatTile tone="status" label="Última rotación OK" value={formatDate(lastRotationDone?.at)} />
            <AdminStatTile tone="status" label="Intentos hoy / ayer" value={recentRotationAttempts.length} helper="solo cron real del hosting" />
            <AdminStatTile tone="status" label="Siguiente paso" value={dashboard.nextStep.label} helper={formatNextRun(dashboard.nextStep.scheduledAt)} />
          </div>
          {latestProgress ? (
            <div className="mt-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                Avance tras la última recolecta
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {priceListProgressSummary(latestProgress)}
              </p>
              <p className="mt-1 text-xs text-muted">{priceListProgressLabel(latestProgress)}</p>
            </div>
          ) : null}
          <p className="mt-3 text-xs text-muted">
            Este bloque solo cuenta llamadas reales de la rotación automática del hosting externo. Los lanzamientos manuales se ven abajo.
          </p>
          <div className="mt-3 rounded-2xl border border-border bg-background/45 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">eBay API / afiliación</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{dashboard.ebayStatus.label}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={dashboard.ebayStatus.collectionReady ? "green" : "rose"}>API directa</Badge>
                <Badge tone={dashboard.ebayStatus.affiliateReady ? "green" : "amber"}>afiliación</Badge>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">{dashboard.ebayStatus.helper}</p>
            {dashboard.ebayStatus.warnings.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-300">
                {dashboard.ebayStatus.warnings.map((warning) => (
                  <li key={warning}>• {warning}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="mt-3 rounded-2xl border border-border bg-background/45 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">IA recolectores</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{dashboard.aiStatus.label}</p>
                <p className="mt-1 text-xs text-muted">{dashboard.aiStatus.helper}</p>
              </div>
              <Badge tone={aiStatusTone(dashboard.aiStatus.workerOpenAiConfigured)}>
                {dashboard.aiStatus.workerOpenAiConfigured === true
                  ? "IA activa"
                  : dashboard.aiStatus.workerOpenAiConfigured === false
                    ? "IA apagada"
                    : "sin confirmar"}
              </Badge>
            </div>
            {dashboard.aiStatus.sourceUsage.length > 0 ? (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="uppercase tracking-wider text-muted">
                    <tr className="border-b border-border">
                      <th className="py-2 pr-3 font-semibold">Fuente</th>
                      <th className="py-2 pr-3 font-semibold">Usó IA</th>
                      <th className="py-2 pr-3 font-semibold">Resueltos</th>
                      <th className="py-2 pr-3 font-semibold">Rechazados</th>
                      <th className="py-2 pr-3 font-semibold">Revisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.aiStatus.sourceUsage.map((source) => (
                      <tr key={source.source} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-3 font-semibold text-foreground">{source.source}</td>
                        <td className="py-2 pr-3 text-muted">{source.aiRows ?? 0}</td>
                        <td className="py-2 pr-3 text-emerald-700 dark:text-emerald-300">{source.resolved ?? 0}</td>
                        <td className="py-2 pr-3 text-rose-700 dark:text-rose-300">{source.rejected ?? 0}</td>
                        <td className="py-2 pr-3 text-amber-700 dark:text-amber-300">{source.review ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 rounded-xl border border-border bg-background/45 p-3 text-xs leading-5 text-muted">
                Aún no hay resumen por fuente en el último estado del worker. Se rellenará en la próxima sincronización de precios.
              </p>
            )}
          </div>
          {dashboard.nextStep.platforms.length > 1 && (
            <p className="mt-3 text-xs text-muted">
              Este lote incluye: {dashboard.nextStep.platforms.map((p) => p.name).join(", ")}.
            </p>
          )}
        </Panel>

        <Panel className={`${adminToneClass("search")} min-w-0`}>
          <PanelTitle eyebrow="Lectura rápida">Sincronizaciones recientes</PanelTitle>
          {freshRows.length > 0 ? (
            <div className="space-y-2 text-sm">
              {freshRows.map((row) => (
                <div key={row.platformSlug} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/45 p-3">
                  <span className="font-semibold text-foreground">{row.platformName}</span>
                  <Badge tone={toneForLabel(dayLabel(row.lastSyncAt))}>{dayLabel(row.lastSyncAt)}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-border bg-background/45 p-3 text-sm leading-6 text-muted">
              No hay recopilaciones registradas hoy ni ayer. La última registrada queda abajo en el historial.
            </p>
          )}
          <p className="mt-3 text-xs text-muted">
            Fuente de datos: {dashboard.syncStateSource === "worker" ? "worker externo" : "copia local"}.
          </p>
        </Panel>
      </div>

      <Panel className={adminToneClass("status")}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <PanelTitle eyebrow="eBay España · cada 6 horas">Campaña regional global</PanelTitle>
            <p className="mt-2 text-sm leading-6 text-muted">
              Recorre todas las plataformas y ediciones del catálogo. Multi-PAL se consulta como una
              misma edición europea; artículo, transporte y coste estimado en España permanecen separados.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={ebayCampaign.status === "blocked" ? "rose" : ebayTotals.deferred ? "amber" : "green"}>
              {ebayCampaign.status ?? "sin estado"}
            </Badge>
            <a
              href="https://github.com/puntoracingrc/RegionAtlasGames/actions/workflows/ebay-ps4-regional-campaign.yml"
              target="_blank"
              rel="noreferrer"
              className="btn-secondary text-xs"
            >
              Abrir campaña
            </a>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <AdminStatTile tone="status" label="Consultados" value={`${ebayCompleted}/${ebayTotal || "—"}`} helper={`${ebayProgress}% del catálogo activo`} />
          <AdminStatTile tone="status" label="Con evidencias" value={ebayTotals.matched ?? 0} helper="al menos un anuncio aceptado" />
          <AdminStatTile tone="status" label="Plataforma actual" value={ebayCampaign.currentPlatformName ?? "Finalizada"} helper={ebayCampaign.currentRegion ?? "sin región pendiente"} />
          <AdminStatTile tone="status" label="Pendientes / aplazados" value={`${ebayTotals.pending ?? 0} / ${ebayTotals.deferred ?? 0}`} helper={formatDate(ebayCampaign.updatedAt)} />
          <AdminStatTile tone="status" label="Primera vuelta" value={ebayCampaign.estimatedDaysRemaining ? `~${ebayCampaign.estimatedDaysRemaining} días` : "Finalizada"} helper={`${ebayCampaign.estimatedRunsRemaining ?? 0} lotes restantes`} />
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-border" aria-label={`Campaña global al ${ebayProgress}%`}>
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, ebayProgress)}%` }} />
        </div>

        {(currentEbayPlatform?.regions?.length ?? 0) > 0 && (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {currentEbayPlatform?.regions?.map((region) => (
              <div key={region.catalogRegion ?? region.label} className="border-l-2 border-border px-3">
                <p className="text-xs font-semibold text-foreground">{region.label ?? region.catalogRegion}</p>
                <p className="mt-1 text-lg font-black text-foreground">{region.completed ?? 0}/{region.total ?? 0}</p>
                <p className="text-[11px] text-muted">
                  {region.matched ?? 0} con datos · {region.marketScope === "multi_region" ? "edición multirregión" : region.originLabel ?? "origen regional"}
                </p>
              </div>
            ))}
          </div>
        )}

        <details className="group mt-5 border-t border-border pt-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-foreground">
            Ver avance de las {ebayCampaign.platforms?.length ?? 0} plataformas
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 pr-4 font-semibold">Plataforma</th>
                  <th className="py-2 pr-4 font-semibold">Consultados</th>
                  <th className="py-2 pr-4 font-semibold">Con datos</th>
                  <th className="py-2 pr-4 font-semibold">Pendientes</th>
                  <th className="py-2 font-semibold">Siguiente región</th>
                </tr>
              </thead>
              <tbody>
                {(ebayCampaign.platforms ?? []).map((platform) => (
                  <tr key={platform.platformSlug} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4 font-semibold text-foreground">{platform.platformName ?? platform.platformSlug}</td>
                    <td className="py-2 pr-4 text-muted">{platform.totals?.completed ?? 0}/{platform.totals?.catalogGames ?? 0}</td>
                    <td className="py-2 pr-4 text-muted">{platform.totals?.matched ?? 0}</td>
                    <td className="py-2 pr-4 text-muted">{platform.totals?.pending ?? 0}</td>
                    <td className="py-2 text-muted">{platform.currentRegion ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <details className="group mt-5 border-t border-border pt-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-foreground">
            Portadas encontradas · {ebayCoverQueue.totals.games ?? ebayCampaign.coverCandidates?.games ?? 0} fichas pendientes de revisar
          </summary>
          {ebayCoverQueue.games.length > 0 ? (
            <div className="mt-3 divide-y divide-border">
              {ebayCoverQueue.games.slice(0, 12).map((game) => {
                const candidate = game.candidates?.[0];
                return (
                  <div key={game.catalogId} className="flex items-center gap-3 py-3">
                    <div className="h-16 w-12 shrink-0 overflow-hidden rounded border border-border bg-background">
                      {candidate?.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- external evidence must not enter the public image cache
                        <img src={candidate.imageUrl} alt="" className="h-full w-full object-contain" loading="lazy" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{game.title ?? game.catalogId}</p>
                      <p className="text-xs text-muted">{game.platformSlug} · {game.region} · confianza {candidate?.confidence == null ? "—" : `${Math.round(candidate.confidence * 100)}%`}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {candidate?.productUrl ? <a href={candidate.productUrl} target="_blank" rel="noreferrer" className="btn-secondary text-xs">eBay</a> : null}
                      {game.catalogId ? <Link href={`/admin/juegos/${encodeURIComponent(game.catalogId)}`} className="btn-secondary text-xs">Ficha</Link> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">La cola se irá llenando únicamente cuando una ficha sin portada tenga una coincidencia regional fiable.</p>
          )}
        </details>

        <details className="group mt-5 rounded-lg border border-border bg-background/45 p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-foreground">
            Ver registro copiable de la campaña
          </summary>
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-4 font-mono text-[11px] leading-5 text-emerald-100">
            {(ebayCampaign.log ?? []).map((entry) => `${entry.at ?? "—"} | ${entry.level ?? "info"} | ${entry.platformSlug ?? "ps4"} | ${entry.region ?? "—"} | ${entry.message ?? ""}`).join("\n") || "Todavía no se ha ejecutado el primer lote."}
          </pre>
        </details>
      </Panel>

      <AdminMarketCollectionPanel
        initialBatches={marketBatches}
        platformOptions={platformOptions}
        regionOptions={regionOptions}
      />

      <AdminPriceSourceSettingsPanel
        initialSettings={priceSourceSettings}
        platformOptions={platformOptions}
        regionOptions={regionOptions}
      />

      <AdminGameReleaseDiscoveryPanel
        initialJobs={localGameJobs}
        tokenConfigured={localGameRunnerTokenConfigured()}
      />

      <AdminLocalGameRunnerPanel
        initialJobs={localGameJobs}
        tokenConfigured={localGameRunnerTokenConfigured()}
      />

      <AdminPriceReviewPanel initialItems={priceReviewItems} />

      <Panel className={adminToneClass("search")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PanelTitle eyebrow="Historial">Últimas plataformas sincronizadas</PanelTitle>
          <div className="flex flex-wrap gap-2">
            {dashboard.workerUrls.state ? (
              <a href={dashboard.workerUrls.state} target="_blank" rel="noreferrer" className="btn-secondary text-xs">
                Ver estado JSON
              </a>
            ) : null}
            <Link href="/admin/entidades" className="btn-secondary text-xs">
              Lanzar por plataforma
            </Link>
          </div>
        </div>
        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {recentSourceTotals.length > 0 ? (
            recentSourceTotals.slice(0, 4).map((source) => (
              <div key={source.label} className="rounded-xl border border-border bg-background/45 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{source.label}</p>
                <p className="mt-1 text-xl font-black text-foreground">{source.value}</p>
                <p className="text-xs text-muted">juegos actualizados en el historial visible</p>
              </div>
            ))
          ) : (
            <p className="rounded-xl border border-border bg-background/45 p-3 text-sm text-muted sm:col-span-2 lg:col-span-4">
              El historial visible todavía no trae conteos por fuente real.
            </p>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-muted">
              <tr className="border-b border-border">
                <th className="py-3 pr-4 font-semibold">Plataforma</th>
                <th className="py-3 pr-4 font-semibold">Cuándo</th>
                <th className="py-3 pr-4 font-semibold">Fuente</th>
                <th className="py-3 pr-4 font-semibold">P2P verif.</th>
                <th className="py-3 pr-4 font-semibold">Cobertura sync</th>
                <th className="py-3 pr-4 font-semibold">Estado</th>
                <th className="py-3 pr-4 font-semibold">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.recentSyncs.map((row) => {
                const sourceUpdates = updatedBySource(row);
                const realUpdates = sourceUpdates.filter((source) => source.label !== "P2P total");
                const sources = realSourceLabels(row);
                const label = dayLabel(row.lastSyncAt);
                const health = syncHealth(row);
                return (
                  <tr key={row.platformSlug} className="border-b border-border/60 align-top last:border-0">
                    <td className="py-3 pr-4">
                      <div className="font-semibold text-foreground">{row.platformName}</div>
                      <div className="text-xs text-muted">{row.platformSlug}</div>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <Badge tone={toneForLabel(label)}>{label}</Badge>
                      <p className="mt-1 text-xs text-muted">{formatDate(row.lastSyncAt)}</p>
                    </td>
                    <td className="py-3 pr-4 max-w-[320px]">
                      {realUpdates.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {realUpdates.map((source) => (
                            <Badge key={source.label} tone="neutral">
                              {source.label}: {source.value}
                            </Badge>
                          ))}
                        </div>
                      ) : sources.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {sources.map((source) => (
                            <Badge key={source} tone="neutral">
                              {source}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap font-semibold text-foreground">
                      {row.gamesUpdated ?? 0}/{row.gamesTargeted ?? 0}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-muted">
                      {row.coveragePct == null ? "—" : `${row.coveragePct}%`}
                      {priceListProgressLabel(row) ? (
                        <p className="mt-1 text-xs whitespace-normal text-emerald-700 dark:text-emerald-300">
                          {priceListProgressLabel(row)}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 max-w-[220px]">
                      <Badge tone={health.tone}>{health.label}</Badge>
                      <p className="mt-1 text-xs leading-5 text-muted">{health.helper}</p>
                    </td>
                    <td className="py-3 pr-4 text-xs text-muted">
                      {sourceUpdates.length > 0
                        ? sourceUpdates.map((s) => `${s.label}: ${s.value}`).join(" · ")
                        : "Sin fuentes con actualización"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted">
          Cobertura sync = porcentaje de juegos objetivo que recibieron precio P2P verificado en esa sincronización concreta.
          El detalle separa el P2P total de las fuentes reales que aportaron datos.
        </p>
      </Panel>

      <Panel className={adminToneClass("bulk")}>
        <div className="mb-4">
          <PanelTitle eyebrow="Cobertura">Estado de precios por plataforma y región</PanelTitle>
          <p className="mt-2 text-sm leading-6 text-muted">
            Marca plataformas completas o regiones concretas, revisa el tiempo estimado y lanza la
            selección en un solo job. El desglose por región te indica dónde falta cobertura.
          </p>
        </div>
        <AdminPriceCoverageTable
          rows={dashboard.platformHealth}
          initialSort={coverageSort}
          canCollect={canCollectPrices}
          unavailableReason={canCollectPrices ? undefined : adminPriceCollectUnavailableReason()}
          manualJobs={dashboard.manualJobs}
        />
      </Panel>

      <Panel className={adminToneClass("status")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PanelTitle eyebrow="Cron automático">Últimos intentos reales de la rueda</PanelTitle>
          <div className="flex flex-wrap gap-2">
            {dashboard.workerUrls.attempts ? (
              <a href={dashboard.workerUrls.attempts} target="_blank" rel="noreferrer" className="btn-secondary text-xs">
                Ver intentos JSON
              </a>
            ) : null}
            {dashboard.workerUrls.cronLog ? (
              <a href={dashboard.workerUrls.cronLog} target="_blank" rel="noreferrer" className="btn-secondary text-xs">
                Abrir log crudo
              </a>
            ) : null}
          </div>
        </div>
        {rotationAttempts.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {rotationAttempts.map((attempt) => (
              <div key={attempt.id} className="rounded-2xl border border-border bg-background/45 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">
                      {attempt.label || attempt.step || "Rotación de precios"}
                    </p>
                    <p className="mt-1 text-xs text-muted">{formatDate(attempt.at)}</p>
                  </div>
                  <Badge tone={cronStatusTone(attempt.status)}>{cronStatusLabel(attempt.status)}</Badge>
                </div>
                {attempt.message ? <p className="mt-3 text-xs leading-5 text-muted">{attempt.message}</p> : null}
                {attempt.jobId ? (
                  <Link href={`/api/admin/price-jobs/${encodeURIComponent(attempt.jobId)}`} className="mt-3 inline-flex text-xs font-semibold text-accent">
                    Ver job lanzado →
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-border bg-background/45 p-3 text-sm text-muted">
            Todavía no hay intentos reales del hosting registrados. Cuando el cron llame a la rueda, aquí quedará reflejado aunque falle.
          </p>
        )}
        <details open className="group mt-4 rounded-2xl border border-emerald-400/30 bg-slate-950 p-4 shadow-inner">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">
                Terminal del cron
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Últimas líneas del log real publicado por el hosting externo.
              </p>
            </div>
            <span className="rounded-xl border border-emerald-400/30 px-3 py-2 text-xs font-semibold text-emerald-200 transition group-open:hidden">
              Expandir
            </span>
            <span className="hidden rounded-xl border border-emerald-400/30 px-3 py-2 text-xs font-semibold text-emerald-200 transition group-open:inline-flex">
              Minimizar
            </span>
          </summary>
          {dashboard.workerUrls.cronLog ? (
            <a href={dashboard.workerUrls.cronLog} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-xl border border-emerald-400/30 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/10">
              Ver archivo completo
            </a>
          ) : null}
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-emerald-400/20 bg-black/70 p-4 font-mono text-xs leading-6 text-emerald-100">
            {dashboard.cronLogTail || "Sin log del cron disponible todavía."}
          </pre>
        </details>
      </Panel>

      <Panel className={adminToneClass("status")}>
        <PanelTitle eyebrow="Trabajos">Lanzamientos manuales y automáticos</PanelTitle>
        {dashboard.manualJobs.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {dashboard.manualJobs.map((job) => (
              <div key={job.jobId} className="rounded-2xl border border-border bg-background/45 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{jobTitle(job)}</p>
                    <p className="mt-1 text-xs text-muted">Inicio: {formatDate(job.startedAt)}</p>
                    {job.finishedAt && <p className="text-xs text-muted">Fin: {formatDate(job.finishedAt)}</p>}
                    {job.estimateMinutes ? <p className="text-xs text-muted">Estimado: ≈ {job.estimateMinutes} min</p> : null}
                  </div>
                  <Badge tone={statusTone(job.status)}>{job.status}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted">
                  Origen: {jobTriggerLabel(job)}
                  {job.trigger === "automatic" ? " · cron/rotación" : " · admin"}
                </p>
                {(() => {
                  const progress = jobProgress(job);
                  if (!progress) return null;
                  return (
                    <div className="mt-3">
                      <div className="flex items-center justify-between gap-3 text-xs text-muted">
                        <span>
                          {progress.done}/{progress.total} procesados
                          {progress.failed ? ` · ${progress.failed} con error` : ""}
                        </span>
                        <span>{progress.pct}%</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${progress.pct}%` }} />
                      </div>
                    </div>
                  );
                })()}
                {job.targets?.length ? (
                  <p className="mt-3 text-xs text-muted">
                    Objetivos:{" "}
                    {job.targets
                      .slice(0, 5)
                      .map((target) => `${target.platformSlug}${target.region ? ` · ${target.region}` : ""}`)
                      .join(", ")}
                    {job.targets.length > 5 ? ` y ${job.targets.length - 5} más` : ""}
                  </p>
                ) : null}
                {job.sources?.length ? (
                  <p className="mt-3 text-xs text-muted">Fuentes: {job.sources.join(", ")}</p>
                ) : null}
                {job.error && <p className="mt-3 text-xs text-rose-600 dark:text-rose-300">{job.error}</p>}
                {job.logTail?.trim() ? (
                  <details className="mt-3 rounded-xl border border-emerald-400/25 bg-slate-950 p-3">
                    <summary className="cursor-pointer list-none text-xs font-semibold text-emerald-200">
                      Terminal del job
                    </summary>
                    <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-emerald-400/15 bg-black/70 p-3 font-mono text-[11px] leading-5 text-emerald-100">
                      {job.logTail}
                    </pre>
                  </details>
                ) : null}
                <Link href={`/api/admin/price-jobs/${encodeURIComponent(job.jobId)}`} className="mt-3 inline-flex text-xs font-semibold text-accent">
                  Ver JSON del job →
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-border bg-background/45 p-3 text-sm text-muted">
            Todavía no hay trabajos manuales guardados en esta instalación.
          </p>
        )}
      </Panel>
    </div>
  );
}
