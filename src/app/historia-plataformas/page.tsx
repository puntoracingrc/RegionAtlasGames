import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, History } from "lucide-react";
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import { PlatformCardArt } from "@/components/platform-card-art";
import { SiteNav } from "@/components/site-nav";
import { getPlatformHistoryData, platformHistoryPath } from "@/lib/platform-history";
import { getPlatformHistoryPresentation } from "@/lib/platform-history-presentation";
import { getSiteUrl } from "@/lib/site-url";
import type { Platform } from "@/lib/types";

const histories = getPlatformHistoryData().platforms.flatMap((history) => {
  const platform = getPlatformHistoryPresentation(history);
  return platform ? [{ history, platform }] : [];
});

const MANUFACTURERS: Array<{ id: Platform["manufacturer"]; label: string }> = [
  { id: "sony", label: "Sony" },
  { id: "microsoft", label: "Microsoft" },
  { id: "nintendo", label: "Nintendo" },
  { id: "sega", label: "Sega" },
  { id: "snk", label: "SNK" },
];

const MANUFACTURER_STYLE: Record<Platform["manufacturer"], string> = {
  sony: "border-blue-400/25 bg-blue-500/[0.04]",
  microsoft: "border-emerald-400/25 bg-emerald-500/[0.04]",
  nintendo: "border-red-400/25 bg-red-500/[0.04]",
  sega: "border-indigo-400/25 bg-indigo-500/[0.04]",
  snk: "border-cyan-400/25 bg-cyan-500/[0.04]",
};

export const metadata: Metadata = {
  title: "Historia por plataforma",
  description:
    "Historia documentada de consolas y plataformas: hardware, personas, compañías, servicios, juegos y relaciones temporales.",
  alternates: { canonical: `${getSiteUrl()}/historia-plataformas` },
  openGraph: {
    title: "Historia por plataforma | Region Atlas",
    description:
      "Archivo editorial de generaciones, hardware, personas y compañías de la industria del videojuego.",
    url: `${getSiteUrl()}/historia-plataformas`,
    type: "website",
  },
};

export default function PlatformHistoriesPage() {
  const groups = MANUFACTURERS.map((manufacturer) => ({
    ...manufacturer,
    entries: histories
      .filter(({ platform }) => platform.manufacturer === manufacturer.id)
      .sort(
        (a, b) =>
          (a.platform.spainReleaseYear ??
            a.history.editorialIdentity?.releaseYear ??
            Number.MAX_SAFE_INTEGER) -
            (b.platform.spainReleaseYear ??
              b.history.editorialIdentity?.releaseYear ??
              Number.MAX_SAFE_INTEGER) ||
          a.platform.sortOrder - b.platform.sortOrder,
      ),
  })).filter((group) => group.entries.length > 0);

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <header className="mb-8 border-b border-border pb-7">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-accent">
            <History aria-hidden className="h-4 w-4" />
            Industria
          </div>
          <h1 className="mt-3 text-3xl font-black text-foreground md:text-4xl">
            Historia por plataforma
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-muted">
            Generaciones documentadas a través de su hardware, sus responsables, las compañías,
            los servicios y los juegos que explican cada etapa.
          </p>
          <p className="mt-4 text-sm text-muted">
            <strong className="text-foreground">{histories.length}</strong> historias publicadas
          </p>
        </header>

        <div className="space-y-10">
          {groups.map((group) => (
            <section key={group.id} aria-labelledby={`history-${group.id}`}>
              <div className="mb-4 flex items-end justify-between gap-4 border-b border-border pb-3">
                <div>
                  <ManufacturerLogo manufacturer={group.id} />
                  <h2 id={`history-${group.id}`} className="mt-2 text-2xl font-bold text-foreground">
                    {group.label}
                  </h2>
                </div>
                <p className="text-sm text-muted">
                  {group.entries.length} {group.entries.length === 1 ? "historia" : "historias"}
                </p>
              </div>

              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {group.entries.map(({ history, platform }) => (
                  <li key={history.platformSlug}>
                    <Link
                      href={platformHistoryPath(history.platformSlug)}
                      className={`group relative block min-h-[210px] overflow-hidden rounded-lg border p-5 transition hover:-translate-y-0.5 hover:border-accent/45 hover:bg-card-hover ${MANUFACTURER_STYLE[platform.manufacturer]}`}
                    >
                      <PlatformCardArt platform={platform} compact />
                      <div className="relative z-10 max-w-[calc(100%-5.5rem)]">
                        <p className="text-xs font-semibold uppercase text-accent">Archivo editorial</p>
                        <h3 className="mt-2 text-xl font-bold text-foreground">{history.title}</h3>
                        {platform.spainReleaseYear ? (
                          <p className="mt-1 text-xs text-muted">Desde {platform.spainReleaseYear} en España</p>
                        ) : history.editorialIdentity?.releaseYear ? (
                          <p className="mt-1 text-xs text-muted">
                            Desde {history.editorialIdentity.releaseYear}
                          </p>
                        ) : null}
                      </div>
                      <p className="relative z-10 mt-5 line-clamp-3 max-w-2xl text-sm leading-6 text-foreground/75">
                        {history.dekEs}
                      </p>
                      <div className="relative z-10 mt-5 flex items-center justify-between gap-3 border-t border-border/70 pt-3 text-xs text-muted">
                        <span>
                          {history.figures.length} figuras · {history.companies.length} compañías
                        </span>
                        <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-accent transition group-hover:translate-x-0.5" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
