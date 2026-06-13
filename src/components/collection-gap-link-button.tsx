"use client";

import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";

type Props = {
  collectionItemId: string;
  className?: string;
};

function LinkSpinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("h-4 w-4 animate-spin text-emerald-400", className)}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-25"
      />
      <path
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        className="opacity-90"
      />
    </svg>
  );
}

export function CollectionGapLinkButton({ collectionItemId, className }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLink(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (loading) return;

    setLoading(true);
    try {
      const res = await fetch("/api/user/collection/items/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionItemId }),
      });
      if (!res.ok) {
        setLoading(false);
        return;
      }
      router.refresh();
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLink}
      disabled={loading}
      aria-busy={loading}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-full border bg-black/75 shadow-md transition disabled:cursor-wait",
        loading
          ? "border-emerald-400/70 bg-black/85"
          : "border-accent/40 text-base font-bold leading-none text-accent hover:border-accent hover:bg-black/90",
        className,
      )}
      title={loading ? "Enlazando con el catálogo…" : "Enlazar con la ficha del catálogo"}
      aria-label={loading ? "Enlazando con el catálogo" : "Enlazar con la ficha del catálogo"}
    >
      {loading ? <LinkSpinner /> : "+"}
    </button>
  );
}
