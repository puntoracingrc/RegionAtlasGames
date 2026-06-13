import { grailLabel, topSegmentLabel } from "@/lib/game-highlight";

export function HighlightLegend({
  showOwned = true,
  compact = false,
}: {
  showOwned?: boolean;
  compact?: boolean;
}) {
  const itemClass = compact
    ? "inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/50 px-2 py-0.5"
    : "inline-flex items-center gap-1.5";

  return (
    <div
      className={
        compact
          ? "flex flex-wrap gap-1.5 text-[10px] text-muted"
          : "flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted"
      }
    >
      {showOwned && (
        <span className={itemClass}>
          <span className="h-2 w-2 rounded-full bg-emerald-500/80" />
          Colección
        </span>
      )}
      <span className={itemClass}>
        <span className="h-2 w-2 rounded-full bg-violet-500/80" />
        {compact ? "Top" : topSegmentLabel()}
      </span>
      <span className={itemClass}>
        <span className="h-2 w-2 rounded-full bg-amber-500/80" />
        {compact ? "Grail" : grailLabel()}
      </span>
    </div>
  );
}
