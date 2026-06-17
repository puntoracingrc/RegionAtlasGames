"use client";

import Image from "next/image";
import { getConsoleMascot } from "@/lib/console-mascots";
import { cn } from "@/lib/cn";

type ConsoleMascotAvatarProps = {
  platformSlug: string;
  fallbackLabel: string;
  className?: string;
  imageClassName?: string;
};

export function ConsoleMascotAvatar({
  platformSlug,
  fallbackLabel,
  className,
  imageClassName,
}: ConsoleMascotAvatarProps) {
  const mascot = getConsoleMascot(platformSlug);

  if (mascot) {
    return (
      <div className={cn("relative h-16 w-16 shrink-0", className)}>
        <Image
          src={mascot.src}
          alt={mascot.label}
          fill
          sizes="96px"
          className={cn("object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.25)]", imageClassName)}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-accent/30 bg-accent/15 text-sm font-black text-accent shadow-sm",
        className,
      )}
    >
      {fallbackLabel.slice(0, 7)}
    </div>
  );
}
