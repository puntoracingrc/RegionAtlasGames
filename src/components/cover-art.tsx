import { cn } from "@/lib/cn";
import { coverAspectClass, coverDetailSizeClass } from "@/lib/cover-aspect";

type Props = {
  src: string | null;
  alt: string;
  platformSlug?: string | null;
  /** card = rejilla; detail = ficha de juego */
  variant?: "card" | "detail";
  className?: string;
};

export function CoverArt({ src, alt, platformSlug, variant = "card", className }: Props) {
  const isDetail = variant === "detail";

  return (
    <div
      className={cn(
        "overflow-hidden border bg-card",
        isDetail
          ? "rounded-xl border-border/80 shadow-xl shadow-black/50 ring-1 ring-white/10"
          : "rounded-lg border-border shadow-md shadow-black/30",
        coverAspectClass(platformSlug),
        isDetail ? coverDetailSizeClass(platformSlug) : "w-full",
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className={cn(
            "h-full w-full object-contain bg-black/25",
            isDetail ? "p-0" : "p-0.5 sm:p-1",
          )}
          loading={isDetail ? "eager" : "lazy"}
          fetchPriority={isDetail ? "high" : undefined}
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center">
          <span className="text-[9px] uppercase tracking-wider text-muted">Sin portada</span>
        </div>
      )}
    </div>
  );
}
