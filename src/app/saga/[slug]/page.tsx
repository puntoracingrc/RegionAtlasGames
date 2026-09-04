import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { IndexEntityDetail } from "@/components/index-entity-detail";
import { getPublicSeriesIndexEntry } from "@/lib/admin-series-manager";
import { getLegacySeriesRedirect } from "@/lib/franchise-system";

type Props = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const redirect = getLegacySeriesRedirect(slug);
  if (redirect) return { alternates: { canonical: redirect.destination } };
  const series = await getPublicSeriesIndexEntry(slug);
  if (!series) return { title: "Saga no encontrada" };
  return {
    title: `${series.name} · Saga`,
    description:
      series.description?.trim() ||
      `${series.name} reúne ${series.gameCount.toLocaleString("es-ES")} juegos en Region Atlas.`,
    alternates: { canonical: `/saga/${series.slug}` },
  };
}

export default async function SeriesDetailPage({ params }: Props) {
  const { slug } = await params;
  const redirect = getLegacySeriesRedirect(slug);
  if (redirect) permanentRedirect(redirect.destination);
  return <IndexEntityDetail kind="series" slug={slug} />;
}
