import { grailLabel, topSegmentLabel } from "@/lib/game-highlight";

export function HighlightLegend({ showOwned = true }: { showOwned?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      {showOwned && (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-emerald-500/50 bg-emerald-500/15" />
          En tu colección
        </span>
      )}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded border border-violet-400/50 bg-violet-500/15 ring-1 ring-violet-400/25" />
        {topSegmentLabel()}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded border border-amber-400/50 bg-amber-500/15 ring-1 ring-amber-400/25" />
        {grailLabel()}
      </span>
    </div>
  );
}
