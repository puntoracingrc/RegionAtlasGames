import { cn } from "@/lib/cn";
import { coverAspectClass, coverCardAspectClass, coverDetailSizeClass } from "@/lib/cover-aspect";

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
        isDetail
          ? cn(coverAspectClass(platformSlug), coverDetailSizeClass(platformSlug))
          : cn(coverCardAspectClass(), "w-full"),
        className,
      )}
    >
      {src ? (
        isDetail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            className="h-full w-full object-cover object-center"
            loading="eager"
            fetchPriority="high"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-black/15 to-black/35 p-1.5 sm:p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="max-h-full max-w-full object-contain object-center"
              loading="lazy"
            />
          </div>
        )
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center">
          <span className="text-[9px] uppercase tracking-wider text-muted">Sin portada</span>
        </div>
      )}
    </div>
  );
}
