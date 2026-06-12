import type { ComponentType } from "react";
import { AU, DE, ES, GB, JP, US } from "country-flag-icons/react/3x2";
import { FlagEu, FlagUnknown } from "@/components/flag-icons";
import { getRegionDisplay, type RegionFlagCode } from "@/lib/region-display";
import { cn } from "@/lib/cn";

type Props = {
  region: string | null | undefined;
  size?: "xs" | "sm" | "md";
  showLabel?: boolean;
  labelMode?: "full" | "short";
  className?: string;
};

type FlagComponent = ComponentType<{ className?: string; title?: string }>;

const FLAG_COMPONENTS: Record<RegionFlagCode, FlagComponent> = {
  ES,
  EU: FlagEu,
  US,
  JP,
  GB,
  DE,
  AU,
  UNKNOWN: FlagUnknown,
};

const sizeClass = {
  xs: "h-3 w-[18px]",
  sm: "h-3.5 w-[21px]",
  md: "h-4 w-6",
};

export function RegionFlag({
  region,
  size = "xs",
  showLabel = false,
  labelMode = "full",
  className,
}: Props) {
  const { flagCode, label, shortLabel } = getRegionDisplay(region);
  const Flag = FLAG_COMPONENTS[flagCode];
  const visibleLabel = labelMode === "short" ? shortLabel : label;

  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1.5", className)}
      title={label}
      aria-label={label}
    >
      <Flag
        aria-hidden
        className={cn(
          sizeClass[size],
          "rounded-[3px] object-cover shadow-sm ring-1 ring-black/10 dark:ring-white/15",
        )}
      />
      {showLabel && (
        <span className="normal-case tracking-normal text-muted">{visibleLabel}</span>
      )}
    </span>
  );
}
