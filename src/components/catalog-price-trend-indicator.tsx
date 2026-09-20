import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CatalogPriceTrend } from "@/lib/types";

export function CatalogPriceTrendIndicator({ trend }: { trend?: CatalogPriceTrend }) {
  if (!trend) return null;
  const config = trend === "up"
    ? { Icon: TrendingUp, label: "Subida de al menos 5 €", className: "text-emerald-500" }
    : trend === "down"
      ? { Icon: TrendingDown, label: "Bajada de al menos 5 €", className: "text-red-500" }
      : { Icon: Minus, label: "Precio estable", className: "text-muted" };
  return (
    <span className={cn("inline-flex shrink-0", config.className)} title={config.label} aria-label={config.label}>
      <config.Icon className="h-3 w-3" aria-hidden />
    </span>
  );
}
