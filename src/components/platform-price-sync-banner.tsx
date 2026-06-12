import { formatPriceSyncDate, getPlatformPriceSync } from "@/lib/price-sync";
import { REGION_VERIFICATION_POLICY } from "@/lib/listing-region-verification";
import { cn } from "@/lib/cn";

type Props = {
  platformSlug: string;
  className?: string;
};

export function PlatformPriceSyncBanner({ platformSlug, className }: Props) {
  const sync = getPlatformPriceSync(platformSlug);

  if (!sync?.lastSyncAt) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-border bg-card/60 px-4 py-3 text-sm text-muted",
          className,
        )}
      >
        <p className="font-medium text-foreground/90">Precios ES · rotación semanal</p>
        <p className="mt-1">{REGION_VERIFICATION_POLICY}</p>
        <p className="mt-1">También se descartan outliers (1 €, caídas imposibles).</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card px-4 py-3 text-sm",
        className,
      )}
    >
      <p className="font-medium text-foreground">
        Precios ES verificados · {formatPriceSyncDate(sync.lastSyncAt)}
      </p>
      <p className="mt-1 text-muted">
        {REGION_VERIFICATION_POLICY}
      </p>
      <p className="mt-2 text-muted">
        Fuente: {sync.source ?? "Mercado ES"} · Cobertura{" "}
        <span className="text-foreground/90">{sync.coveragePct}%</span> (
        {sync.gamesUpdated.toLocaleString("es-ES")} de{" "}
        {sync.gamesTargeted.toLocaleString("es-ES")} títulos) ·{" "}
        {(sync.gamesRejectedUnverifiedRegion ?? 0).toLocaleString("es-ES")} sin región ·{" "}
        {(sync.gamesRejectedRegionMismatch ?? 0).toLocaleString("es-ES")} región distinta ·{" "}
        {(sync.gamesRejectedInsufficientEvidence ?? 0).toLocaleString("es-ES")} pruebas
        insuficientes · {(sync.cexGamesUpdated ?? 0).toLocaleString("es-ES")} CeX ·{" "}
        {(sync.jgoGamesUpdated ?? 0).toLocaleString("es-ES")} JGO ·{" "}
        {(sync.cholloGamesUpdated ?? 0).toLocaleString("es-ES")} Chollo ·{" "}
        {(sync.kaotoGamesUpdated ?? 0).toLocaleString("es-ES")} Kaoto ·{" "}
        {sync.gamesRejectedOutliers.toLocaleString("es-ES")} outliers
      </p>
    </div>
  );
}
