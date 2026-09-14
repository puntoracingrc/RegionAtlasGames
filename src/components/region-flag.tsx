import type { ComponentType } from "react";
import {
  AE, AO, AR, AT, AU, BE, BG, BH, BR, CA, CH, CL, CN, CO, CZ, DE, DK,
  ES, FI, FR, GB, GR, HK, HU, ID, IE, IL, IN, IT, JP, KR, KW, LU, MX,
  MY, MZ, NL, NO, NZ, OM, PE, PH, PL, PT, QA, RO, RU, SA, SE, SG, SK,
  TH, TR, TW, UA, US, ZA,
} from "country-flag-icons/react/3x2";
import { FlagEu, FlagUnknown } from "@/components/flag-icons";
import { getRegionDisplay, type RegionFlagCode } from "@/lib/region-display";
import { cn } from "@/lib/cn";

type Props = {
  region: string | null | undefined;
  size?: "xs" | "sm" | "md";
  showLabel?: boolean;
  labelMode?: "full" | "short";
  labelOverride?: string;
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
  IT,
  AU,
  AT, BE, CA, CN, DK, FI, FR, GR, HK, IE, IL, KR, NL, NO, PL, PT, RU, SE, TW,
  AE, AO, AR, BG, BH, BR, CH, CL, CO, CZ, HU, ID, IN, KW, LU, MX, MY, MZ,
  NZ, OM, PE, PH, QA, RO, SA, SG, SK, TH, TR, UA, ZA,
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
  labelOverride,
  className,
}: Props) {
  const { flagCode, label, shortLabel } = getRegionDisplay(region);
  const Flag = FLAG_COMPONENTS[flagCode] ?? FlagUnknown;
  const visibleLabel = labelOverride ?? (labelMode === "short" ? shortLabel : label);
  const accessibleLabel = labelOverride ?? label;

  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1.5", className)}
      title={accessibleLabel}
      aria-label={accessibleLabel}
    >
      <Flag
        aria-hidden
        className={cn(
          sizeClass[size],
          "rounded-[3px] object-cover shadow-sm ring-1 ring-black/10 dark:ring-white/15",
        )}
      />
      {showLabel && (
        <span className="normal-case tracking-normal text-foreground/75">{visibleLabel}</span>
      )}
    </span>
  );
}
