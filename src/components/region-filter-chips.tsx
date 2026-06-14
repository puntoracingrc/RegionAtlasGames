"use client";

import { RegionFlag } from "@/components/region-flag";
import { cn } from "@/lib/cn";

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; count: number }>;
  allLabel?: string;
  className?: string;
};

export function RegionFilterChips({
  value,
  onChange,
  options,
  allLabel = "Todas",
  className,
}: Props) {
  if (options.length === 0) return null;

  const total = options.reduce((sum, opt) => sum + opt.count, 0);

  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="group" aria-label="Filtrar por región">
      <RegionChip
        active={value === "all"}
        onClick={() => onChange("all")}
        label={`${allLabel} (${total.toLocaleString("es-ES")})`}
      />
      {options.map((opt) => (
        <RegionChip
          key={opt.value}
          active={value === opt.value}
          onClick={() => onChange(opt.value)}
          region={opt.label}
          count={opt.count}
        />
      ))}
    </div>
  );
}

function RegionChip({
  active,
  onClick,
  label,
  region,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label?: string;
  region?: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
        active
          ? "border-accent/50 bg-accent/15 text-accent"
          : "border-border bg-card text-foreground/85 hover:border-accent/30 hover:bg-card-hover",
      )}
    >
      {region ? (
        <>
          <RegionFlag region={region} size="xs" showLabel labelMode="short" />
          {count != null && (
            <span className={cn("tabular-nums text-muted", active && "text-accent/90")}>
              {count.toLocaleString("es-ES")}
            </span>
          )}
        </>
      ) : (
        <span>{label}</span>
      )}
    </button>
  );
}
