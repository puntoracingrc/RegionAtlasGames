import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, Gamepad2, History } from "lucide-react";
import { BackLink } from "@/components/breadcrumbs";
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import { PlatformHeroArt } from "@/components/platform-card-art";
import { PlatformHistorySection } from "@/components/platform-history-section";
import { SiteNav } from "@/components/site-nav";
import { hasPublicCatalogGames } from "@/lib/catalog";
import {
  getPlatformHistory,
  getPlatformHistorySlugs,
  parsePlatformHardwareGroup,
  platformHistoryPath,
} from "@/lib/platform-history";
import {
  getPlatformHistoryPresentation,
  isCatalogBackedPlatformHistory,
} from "@/lib/platform-history-presentation";
import { getPublicPersonView } from "@/lib/person-public-research";
import { getSiteUrl } from "@/lib/site-url";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ hardware?: string }>;
};

function clip(text: string, max = 160): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function generateStaticParams() {
  return getPlatformHistorySlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const history = getPlatformHistory(slug);
  if (!history) return { title: "Historia de plataforma no encontrada" };
  const url = `${getSiteUrl()}${platformHistoryPath(slug)}`;
  const description = clip(history.dekEs);
  return {
    title: `Historia de ${history.title}`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `Historia de ${history.title} | Region Atlas`,
      description,
      url,
      type: "article",
    },
  };
}

export default async function PlatformHistoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  const history = getPlatformHistory(slug);
  const platform = history ? getPlatformHistoryPresentation(history) : undefined;
  if (!history || !platform) notFound();

  const figurePortraits = Object.fromEntries(
    history.figures.map((figure) => [
      figure.personSlug,
      getPublicPersonView(figure.personSlug)?.profile.portrait?.path ?? null,
    ]),
  );
  const hasCatalog = isCatalogBackedPlatformHistory(history) && hasPublicCatalogGames(slug);

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <BackLink href="/historia-plataformas">Historia por plataforma</BackLink>

        <header className="relative mt-5 overflow-hidden border-b border-border pb-8 pt-2">
          <PlatformHeroArt platform={platform} />
          <div className="relative z-10 max-w-4xl">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-accent">
              <History aria-hidden className="h-4 w-4" />
              Industria · Historia por plataforma
            </div>
            <div className="mt-4">
              <ManufacturerLogo manufacturer={platform.manufacturer} />
            </div>
            <h1 className="mt-3 text-3xl font-black text-foreground md:text-5xl">
              Historia de {history.title}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted">{platform.description}</p>
            {hasCatalog ? (
              <Link
                href={`/plataforma/${platform.slug}`}
                className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-card px-3.5 text-sm font-semibold text-foreground transition hover:border-accent/40 hover:bg-card-hover"
              >
                <Gamepad2 aria-hidden className="h-4 w-4" />
                Ver catálogo de {platform.shortName}
                <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
        </header>

        <PlatformHistorySection
          history={history}
          figurePortraits={figurePortraits}
          initialHardwareGroup={parsePlatformHardwareGroup(query?.hardware)}
        />
      </main>
    </>
  );
}
