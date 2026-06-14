"use client";

import { useState } from "react";
import type { PlatformConsoleArt } from "@/lib/platform-console-art";

type Props = {
  art: PlatformConsoleArt;
  className?: string;
};

/** Consola de la plataforma actual — hero derecho, fondo negro del asset intacto. */
export function PlatformConsoleArt({ art, className }: Props) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return null;
  }

  return (
    <div
      className={`pointer-events-none shrink-0 overflow-hidden rounded-xl bg-black ${className ?? ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={art.src}
        alt={art.alt}
        width={art.width}
        height={art.height}
        className="h-auto w-[72px] sm:w-[88px] md:w-[100px]"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
