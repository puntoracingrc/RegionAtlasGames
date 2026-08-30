"use client";

import { LoaderCircle } from "lucide-react";
import { useLinkStatus } from "next/link";
import { cn } from "@/lib/cn";

export function LinkPendingFeedback({
  label = "Cargando…",
  overlay = false,
}: {
  label?: string;
  overlay?: boolean;
}) {
  const { pending } = useLinkStatus();

  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden bg-accent/20 transition-opacity",
          pending ? "opacity-100" : "opacity-0",
        )}
      >
        <span className="navigation-progress-bar block h-full bg-accent" />
      </span>
      {overlay ? (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/70 px-3 text-center transition-opacity",
            pending ? "opacity-100" : "opacity-0",
          )}
        >
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-white">
            <LoaderCircle className="h-5 w-5 animate-spin" />
            {label}
          </span>
        </span>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {pending ? label : ""}
      </span>
    </>
  );
}
