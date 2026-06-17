"use client";

import { ConsoleMascotAvatar } from "@/components/console-mascot-avatar";
import { cn } from "@/lib/cn";

type PlatformProcessMascotProps = {
  platformSlug: string;
  platformName: string;
  platformShortName: string;
  title: string;
  message: string;
  detail?: string;
  tone?: "success" | "info" | "warning";
  className?: string;
};

const toneClass = {
  success: "border-emerald-300/45 bg-emerald-500/10",
  info: "border-sky-300/45 bg-sky-500/10",
  warning: "border-amber-300/55 bg-amber-500/10",
};

export function PlatformProcessMascot({
  platformSlug,
  platformName,
  platformShortName,
  title,
  message,
  detail,
  tone = "success",
  className,
}: PlatformProcessMascotProps) {
  return (
    <section
      className={cn(
        "import-race-pop mt-4 overflow-hidden rounded-2xl border p-4 shadow-sm shadow-black/5 dark:shadow-black/20",
        toneClass[tone],
        className,
      )}
    >
      <div className="flex items-center gap-4">
        <ConsoleMascotAvatar
          platformSlug={platformSlug}
          fallbackLabel={platformShortName}
          className="h-24 w-24 sm:h-28 sm:w-28"
          imageClassName="drop-shadow-2xl"
        />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">{title}</p>
          <h3 className="mt-1 text-lg font-black text-foreground">{platformName}</h3>
          <p className="mt-1 text-sm leading-6 text-foreground">{message}</p>
          {detail && <p className="mt-2 text-xs leading-5 text-muted">{detail}</p>}
        </div>
      </div>
    </section>
  );
}
