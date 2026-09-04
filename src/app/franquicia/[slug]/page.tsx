import type { Metadata } from "next";
import { IndexEntityDetail } from "@/components/index-entity-detail";
import { getPublicFranchiseIndexEntry } from "@/lib/admin-franchise-manager";
import { formatCatalogEntryCount } from "@/lib/catalog-entry-count";
import { summarizeIndexEntry } from "@/lib/index-entity";

type Props = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const franchise = await getPublicFranchiseIndexEntry(slug);
  if (!franchise) return { title: "Franquicia no encontrada" };
  const summary = summarizeIndexEntry(franchise, "franchise");
  const description = franchise.description?.trim() ||
    `${franchise.name} reúne ${formatCatalogEntryCount(summary.catalogEntryCount)} en Region Atlas.`;
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
