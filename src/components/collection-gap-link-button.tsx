"use client";

import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";

type Props = {
  collectionItemId: string;
  className?: string;
};

export function CollectionGapLinkButton({ collectionItemId, className }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLink(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    setLoading(true);
    try {
      const res = await fetch("/api/user/collection/items/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionItemId }),
      });
      if (!res.ok) return;
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLink}
      disabled={loading}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-full border border-accent/40 bg-black/75 text-base font-bold leading-none text-accent shadow-md transition hover:border-accent hover:bg-black/90 disabled:opacity-50",
        className,
      )}
      title="Enlazar con la ficha del catálogo"
      aria-label="Enlazar con la ficha del catálogo"
    >
      {loading ? "…" : "+"}
    </button>
  );
}
