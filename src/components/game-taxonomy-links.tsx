"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { cn } from "@/lib/cn";

export type GameTaxonomyLink = {
  name: string;
  href: string;
};

const chipClass =
  "rounded-md bg-white/10 px-2 py-0.5 text-xs text-accent/90 transition hover:bg-white/15 hover:text-accent";

function uniqueLinks(links: GameTaxonomyLink[]): GameTaxonomyLink[] {
  const seen = new Set<string>();
  const unique: GameTaxonomyLink[] = [];
  for (const link of links) {
    const key = link.href || link.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(link);
  }
  return unique;
}

function TaxonomyChip({ link }: { link: GameTaxonomyLink }) {
  return (
    <Link href={link.href} className={chipClass}>
      {link.name}
    </Link>
  );
}

export function GameTaxonomyLinks({
  links,
  maxInline,
  modalTitle = "Todas las facetas",
}: {
  links: GameTaxonomyLink[];
  maxInline?: number;
  modalTitle?: string;
}) {
  const modalTitleId = useId();
  const [open, setOpen] = useState(false);
  const unique = uniqueLinks(links);

  if (unique.length === 0) return <>—</>;

  const visible = typeof maxInline === "number" ? unique.slice(0, maxInline) : unique;
  const hiddenCount = unique.length - visible.length;

  return (
    <>
      <span className="flex flex-wrap gap-1.5">
        {visible.map((link) => (
          <TaxonomyChip key={link.href} link={link} />
        ))}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(chipClass, "font-semibold")}
            aria-haspopup="dialog"
          >
            +{hiddenCount}
          </button>
        )}
      </span>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={modalTitleId}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-white/15 bg-slate-950 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">
                  Entidades del juego
                </p>
                <h2 id={modalTitleId} className="mt-1 text-lg font-black text-white">
                  {modalTitle}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-white/15 px-3 py-1 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white"
                aria-label="Cerrar ventana de facetas"
              >
                Cerrar
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-5">
              <div className="grid gap-2 sm:grid-cols-2">
                {unique.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-semibold text-accent/95 hover:border-accent/40 hover:bg-accent/10"
                  >
                    {link.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
