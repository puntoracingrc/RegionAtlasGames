"use client";

import { useState } from "react";
import { AFFILIATE_DISCLOSURE_COMPACT_TEXT, AFFILIATE_DISCLOSURE_TEXT } from "@/lib/affiliate/disclosure";

export function AffiliateDisclosure() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-background/50 px-3 py-2 text-xs leading-5 text-muted">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold text-foreground">{AFFILIATE_DISCLOSURE_COMPACT_TEXT}</span>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="font-semibold text-accent underline-offset-4 hover:underline"
        >
          {expanded ? "Menos info" : "Más info"}
        </button>
      </div>
      {expanded ? <p className="mt-2 max-w-3xl">{AFFILIATE_DISCLOSURE_TEXT}</p> : null}
    </div>
  );
}
