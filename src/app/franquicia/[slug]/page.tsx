import type { Metadata } from "next";
import { IndexEntityDetail } from "@/components/index-entity-detail";
import { getPublicFranchiseIndexEntry } from "@/lib/admin-franchise-manager";

type Props = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const franchise = await getPublicFranchiseIndexEntry(slug);
  if (!franchise) return { title: "Franquicia no encontrada" };
  const description = franchise.description?.trim() ||
    `${franchise.name} reúne ${franchise.gameCount.toLocaleString("es-ES")} juegos en Region Atlas.`;
  return {
    title: `${franchise.name} · Franquicia`,
    description,
    alternates: { canonical: `/franquicia/${franchise.slug}` },
  };
}

export default async function FranchiseDetailPage({ params }: Props) {
  const { slug } = await params;
  return <IndexEntityDetail kind="franchise" slug={slug} />;
}
