import Image from "next/image";
import Link from "next/link";

import { buildSagaMascotLine, getSagaMascot } from "@/lib/saga-mascots";
import type { SeriesProfile } from "@/lib/series-profile";

type Props = {
  profile?: SeriesProfile;
  compact?: boolean;
};

export function SagaMascotWelcome({ profile, compact = false }: Props) {
  const mascot = getSagaMascot(profile?.slug);
  if (!mascot) return null;

  const line = buildSagaMascotLine(profile, mascot);

  return (
    <section
      className={`mb-8 overflow-hidden rounded-[2rem] border text-white shadow-soft ${mascot.sectionClass}`}
    >
      <div className="grid gap-5 p-5 md:grid-cols-[1fr_260px] md:items-end md:p-7 lg:grid-cols-[1fr_340px]">
        <div className="relative z-10">
          <p className={`text-xs font-black uppercase tracking-[0.32em] ${mascot.eyebrowClass}`}>
            {mascot.eyebrow}
          </p>
          <h2 className="mt-3 max-w-3xl text-3xl font-black tracking-tight md:text-5xl">
            {profile ? `Bienvenido a ${profile.name}` : mascot.title}
          </h2>
          <div className={`mt-5 max-w-3xl rounded-3xl border bg-black/25 p-4 shadow-inner backdrop-blur ${mascot.bubbleClass}`}>
            <p className="text-base leading-8 md:text-lg">“{line}”</p>
            <p className="mt-3 text-sm text-white/65">
              Mensaje original de la mascota, inspirado en el tono de la saga.
            </p>
          </div>

          {!compact && (
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="#saga-games"
                className={`rounded-2xl px-5 py-3 text-sm font-black transition ${mascot.ctaClass}`}
              >
                {mascot.ctaLabel}
              </Link>
              <Link
                href="/saga"
                className="rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/15"
              >
                Ver todas las sagas
              </Link>
            </div>
          )}
        </div>

        <div className="relative mx-auto h-64 w-full max-w-[280px] md:h-80 md:max-w-none lg:h-96">
          <div className="absolute inset-x-8 bottom-3 h-14 rounded-full bg-black/40 blur-2xl" />
          <Image
            src={mascot.imageSrc}
            alt={mascot.alt}
            fill
            sizes="(min-width: 1024px) 340px, (min-width: 768px) 260px, 280px"
            className="object-contain object-bottom drop-shadow-[0_24px_40px_rgba(0,0,0,0.45)]"
            priority
          />
        </div>
      </div>
    </section>
  );
}
