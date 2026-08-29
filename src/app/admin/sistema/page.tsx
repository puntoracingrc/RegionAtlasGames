import { AdminSystemTools } from "@/components/admin/admin-system-tools";
import { AdminNotice, AdminStatTile } from "@/components/admin/admin-visual";
import { Panel, PanelTitle } from "@/components/ui";
import { blobAuthConfigured } from "@/lib/blob-auth";
import {
  adminHealthTone,
  classifyCollectors,
  classifyStagingAutomation,
} from "@/lib/admin-operations-health";
import { readCatalogStagingIndex } from "@/lib/catalog-staging-storage";
import { readPriceSourceSettings } from "@/lib/price-source-settings";
import type { CatalogStagingIndex } from "@/lib/catalog-staging-types";

function formatDate(value: string | null | undefined): string {
  if (!value) return "Sin datos";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Fecha inválida";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(new Date(parsed));
}

function inline(value: unknown): string {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

export default async function AdminSystemPage() {
  const [indexResult, sourcesResult] = await Promise.allSettled([
    readCatalogStagingIndex({ fresh: true }),
    readPriceSourceSettings(),
  ]);
  const index: CatalogStagingIndex | null =
    indexResult.status === "fulfilled" ? indexResult.value : null;
  const sourceSettings = sourcesResult.status === "fulfilled" ? sourcesResult.value : null;
  const sources = sourceSettings
    ? [...Object.values(sourceSettings.sources), ...sourceSettings.customSources]
    : [];
  const manualActive = sources.filter((source) => source.enabledManual ?? source.enabled).length;
  const rotationActive = sources.filter((source) => source.enabledRotation ?? source.enabled).length;
  const pendingEnrichment = Object.values(index?.byPlatform ?? {}).reduce(
    (total, stats) => total + stats.pendingEnrich,
    0,
  );
  const durableStorage = blobAuthConfigured();
  const isVercel = Boolean(process.env.VERCEL);
  const storageHealthy = durableStorage || !isVercel;
  const lastRun = index?.lastEnrichmentRun;
  const deploymentSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || "local";
  const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || "local";
  const generatedAt = new Date().toISOString();
  const stagingHealth = classifyStagingAutomation(index);
  const collectorsHealth = classifyCollectors(
    sourceSettings ? { total: sources.length, manualActive, rotationActive } : null,
  );
  const hasOperationalAction =
    !storageHealthy ||
    indexResult.status === "rejected" ||
    sourcesResult.status === "rejected" ||
    stagingHealth.level === "action";
  const hasOperationalWatch =
    stagingHealth.level === "watch" || collectorsHealth.level === "watch";

  const diagnostic = [
    "REGION_ATLAS_HEALTH_V1",
    "CODEX_HANDOFF_CONTEXT_V1",
    "scope=admin_system_health",
    "project=regionatlas.games",
    "local_repo=/Users/macbookpro14/Projects/pal-es-market",
    "production=https://www.regionatlas.games",
    "github=https://github.com/puntoracingrc/RegionAtlasGames",
    "rules=read-only-first; never expose tokens; never mutate production data or enable price collectors without explicit approval",
    "deploy_flow=branch -> commit -> push -> PR -> checks -> merge -> main deployment -> verify production",
    "verify_after_deploy=/ 200; /admin requires admin auth; protected admin APIs return 401 without auth; collectors retain intended paused state",
    "security_focus=admin authorization; same-origin mutations; durable Blob; upload limits; rate limits; no secrets in NEXT_PUBLIC",
    "if_blocked=report exact blocker; preserve user data; do not force destructive rollback",
    `generatedAt=${generatedAt}`,
    `environment=${inline(environment)}`,
    `deploymentSha=${inline(deploymentSha)}`,
    `storage.backend=${durableStorage ? "vercel_blob" : "local_disk"}`,
    `storage.status=${storageHealthy ? "ok" : "action"}`,
    `staging.totalGames=${index?.pcIds.length ?? "unknown"}`,
    `staging.pendingEnrichment=${index ? pendingEnrichment : "unknown"}`,
    `staging.indexUpdatedAt=${index?.updatedAt ?? "unknown"}`,
    `cron.lastStartedAt=${lastRun?.startedAt ?? "unknown"}`,
    `cron.lastElapsedMs=${lastRun?.elapsedMs ?? "unknown"}`,
    `cron.lastScanned=${lastRun?.scanned ?? "unknown"}`,
    `cron.lastAttempted=${lastRun?.attempted ?? "unknown"}`,
    `cron.lastEnriched=${lastRun?.enriched ?? "unknown"}`,
    `cron.lastFailed=${lastRun?.failed ?? "unknown"}`,
    `cron.stoppedByBudget=${lastRun?.stoppedByBudget ?? "unknown"}`,
    `cron.healthLevel=${stagingHealth.level}`,
    `cron.healthLabel=${inline(stagingHealth.label)}`,
    `priceSources.total=${sourcesResult.status === "fulfilled" ? sources.length : "unknown"}`,
    `priceSources.manualActive=${sourcesResult.status === "fulfilled" ? manualActive : "unknown"}`,
    `priceSources.rotationActive=${sourcesResult.status === "fulfilled" ? rotationActive : "unknown"}`,
    `priceSources.healthLevel=${collectorsHealth.level}`,
    `priceSources.healthLabel=${inline(collectorsHealth.label)}`,
    `readErrors.staging=${indexResult.status === "rejected" ? inline(indexResult.reason) : "none"}`,
    `readErrors.priceSources=${sourcesResult.status === "rejected" ? inline(sourcesResult.reason) : "none"}`,
  ].join("\n");

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
            Operación
          </p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-foreground">
            Salud del sistema
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Estado técnico esencial para detectar fallos de almacenamiento, tareas y recolección.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AdminStatTile
            label="Almacenamiento"
            value={durableStorage ? "Blob" : "Disco local"}
            helper={storageHealthy ? "Persistencia disponible" : "Falta almacenamiento duradero"}
            tone={storageHealthy ? "status" : "danger"}
          />
          <AdminStatTile
            label="Cola staging"
            value={index?.pcIds.length ?? "—"}
            helper={`${pendingEnrichment} pendientes de enriquecer`}
            tone={adminHealthTone(stagingHealth.level)}
          />
          <AdminStatTile
            label="Último cron"
            value={formatDate(lastRun?.completedAt)}
            helper={lastRun ? `${lastRun.elapsedMs} ms · ${lastRun.attempted} intentos` : stagingHealth.detail}
            tone={adminHealthTone(stagingHealth.level)}
          />
          <AdminStatTile
            label="Recolectores activos"
            value={`${manualActive} manual · ${rotationActive} rueda`}
            helper={collectorsHealth.detail}
            tone={adminHealthTone(collectorsHealth.level)}
          />
        </div>
      </section>

      <AdminNotice tone={hasOperationalAction ? "danger" : hasOperationalWatch ? "edit" : "status"}>
        {hasOperationalAction
          ? "Hay un fallo o una automatización sin confirmar que requiere revisión."
          : hasOperationalWatch
            ? "El sistema responde, pero hay una tarea que conviene vigilar."
            : collectorsHealth.level === "paused"
              ? `Sistema disponible. Los recolectores están pausados; despliegue ${deploymentSha} en ${environment}.`
              : `Configuración estable. Despliegue ${deploymentSha} en ${environment}.`}
      </AdminNotice>

      <Panel>
        <PanelTitle eyebrow="Diagnóstico">Informe copiable para soporte</PanelTitle>
        <p className="mb-4 max-w-3xl text-sm leading-6 text-muted">
          Incluye contexto operativo y métricas, pero nunca credenciales ni tokens.
        </p>
        <AdminSystemTools diagnostic={diagnostic} />
      </Panel>
    </div>
  );
}
