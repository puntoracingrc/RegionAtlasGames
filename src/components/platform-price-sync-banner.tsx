import { formatPriceSyncDate, getPlatformPriceSync } from "@/lib/price-sync";
import { REGION_VERIFICATION_POLICY } from "@/lib/listing-region-verification";
import { cn } from "@/lib/cn";

type Props = {
  platformSlug: string;
  className?: string;
};

type SourceChip = { label: string; count: number };

function sourceChips(sync: NonNullable<ReturnType<typeof getPlatformPriceSync>>): SourceChip[] {
  const items: SourceChip[] = [
    { label: "CeX", count: sync.cexGamesUpdated ?? 0 },
    { label: "JGO", count: sync.jgoGamesUpdated ?? 0 },
    { label: "Chollo", count: sync.cholloGamesUpdated ?? 0 },
    { label: "Kaoto", count: sync.kaotoGamesUpdated ?? 0 },
    { label: "TodoConsolas", count: sync.tcnsGamesUpdated ?? 0 },
    { label: "TodoColección", count: sync.tcGamesUpdated ?? 0 },
  ];
  return items.filter((item) => item.count > 0);
}

/** @deprecated use PlatformPriceCoverage */
export function PlatformPriceSyncBanner(props: Props) {
  return <PlatformPriceCoverage {...props} />;
}

export function PlatformPriceCoverage({ platformSlug, className }: Props) {
  const sync = getPlatformPriceSync(platformSlug);

  if (!sync?.lastSyncAt) {
    return (
      <div className={cn("bg-muted/5 px-5 py-4 md:px-7", className)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Precios por región verificada</p>
            <p className="mt-0.5 text-xs text-muted">
              Rotación semanal · PAL ES, PAL EU, USA, Japón… · aún sin sync en esta plataforma
            </p>
          </div>
          <span className="rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted">
            Pendiente
          </span>
        </div>
        <details className="mt-3 text-xs text-muted">
          <summary className="cursor-pointer font-medium text-foreground/60 hover:text-foreground/80">
            Criterios de verificación
          </summary>
          <p className="mt-2 leading-relaxed">{REGION_VERIFICATION_POLICY}</p>
        </details>
      </div>
    );
  }

  const coverage = sync.coveragePct;
  const chips = sourceChips(sync);
  const rejected =
    (sync.gamesRejectedUnverifiedRegion ?? 0) +
    (sync.gamesRejectedRegionMismatch ?? 0) +
    (sync.gamesRejectedInsufficientEvidence ?? 0) +
    sync.gamesRejectedOutliers;

  return (
    <div className={cn("bg-muted/5 px-5 py-4 md:px-7", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">Precios con región verificada</p>
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
              {coverage}%
            </span>
            <span className="text-xs text-muted">{formatPriceSyncDate(sync.lastSyncAt)}</span>
          </div>

          <div className="space-y-1.5">
            <div className="flex h-2 overflow-hidden rounded-full bg-foreground/8">
              <div
                className="rounded-full bg-accent transition-all"
                style={{ width: `${Math.min(100, Math.max(coverage, 0.5))}%` }}
              />
            </div>
            <p className="text-[11px] text-muted">
              {sync.gamesUpdated.toLocaleString("es-ES")} de{" "}
              {sync.gamesTargeted.toLocaleString("es-ES")} ediciones con dato · {sync.source ?? "Mercado"}
            </p>
          </div>
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 sm:max-w-xs sm:justify-end">
            {chips.map((chip) => (
              <span
                key={chip.label}
                className="rounded-md border border-border/80 bg-card px-2 py-1 text-[10px] text-muted"
              >
                <span className="font-semibold text-foreground/80">{chip.label}</span>{" "}
                {chip.count.toLocaleString("es-ES")}
              </span>
            ))}
          </div>
        )}
      </div>

      <details className="mt-3 text-xs text-muted">
        <summary className="cursor-pointer font-medium text-foreground/55 hover:text-foreground/75">
          Detalle de verificación
          {rejected > 0 && (
            <span className="ml-1.5 font-normal text-muted">
              · {rejected.toLocaleString("es-ES")} descartados
            </span>
          )}
        </summary>
        <p className="mt-2 leading-relaxed">{REGION_VERIFICATION_POLICY}</p>
        <dl className="mt-3 grid gap-1.5 sm:grid-cols-2">
          <StatRow label="Sin región verificada" value={sync.gamesRejectedUnverifiedRegion ?? 0} />
          <StatRow label="Región distinta" value={sync.gamesRejectedRegionMismatch ?? 0} />
          <StatRow label="Pruebas insuficientes" value={sync.gamesRejectedInsufficientEvidence ?? 0} />
          <StatRow label="Outliers descartados" value={sync.gamesRejectedOutliers} />
        </dl>
      </details>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  if (value <= 0) return null;
  return (
    <div className="flex justify-between gap-2 rounded-md bg-card/60 px-2 py-1">
      <dt>{label}</dt>
      <dd className="font-medium text-foreground/80">{value.toLocaleString("es-ES")}</dd>
    </div>
  );
}
