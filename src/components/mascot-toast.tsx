"use client";

import Image from "next/image";

import { cn } from "@/lib/cn";
import { getConsoleMascot } from "@/lib/console-mascots";

type MascotToastProps = {
  mascotSrc?: string;
  mascotLabel?: string;
  platformSlug?: string;
  message: string;
  detail?: string;
  tone?: "success" | "info" | "warning";
  onClose: () => void;
};

const toneClass = {
  success: "border-emerald-200/80 bg-emerald-50/95 text-emerald-950",
  info: "border-sky-200/80 bg-sky-50/95 text-sky-950",
  warning: "border-amber-200/80 bg-amber-50/95 text-amber-950",
};

export function MascotToast({
  mascotSrc,
  mascotLabel,
  platformSlug,
  message,
  detail,
  tone = "success",
  onClose,
}: MascotToastProps) {
  const platformMascot = platformSlug ? getConsoleMascot(platformSlug) : undefined;
  const src = mascotSrc ?? platformMascot?.src;
  const label = mascotLabel ?? platformMascot?.label ?? "Mascota de Region Atlas";

  if (!src) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex max-w-[calc(100vw-2.5rem)] items-end gap-3 sm:bottom-7 sm:right-7">
      <div
        className={cn(
          "pointer-events-auto relative max-w-[280px] rounded-3xl border px-4 py-3 pr-9 shadow-2xl shadow-slate-900/15 backdrop-blur mascot-toast-pop",
          toneClass[tone],
        )}
        role="status"
        aria-live="polite"
      >
        <button
          type="button"
          className="absolute right-3 top-2 rounded-full text-lg leading-none opacity-50 transition hover:opacity-100"
          onClick={onClose}
          aria-label="Cerrar mensaje"
        >
          ×
        </button>
        <p className="text-sm font-bold leading-snug">{message}</p>
        {detail && <p className="mt-1 text-xs leading-snug opacity-75">{detail}</p>}
      </div>
      <div className="pointer-events-none relative h-28 w-28 shrink-0 sm:h-32 sm:w-32 mascot-toast-pop">
        <Image
          src={src}
          alt={label}
          fill
          sizes="128px"
          className="object-contain drop-shadow-2xl"
          priority={false}
        />
      </div>
    </div>
  );
}
