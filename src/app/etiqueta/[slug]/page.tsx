import { notFound } from "next/navigation";
import { GameFacetProfileDetail } from "@/components/game-facet-profile-detail";
import { IndexEntityDetail } from "@/components/index-entity-detail";
import { summarizeIndexSlug } from "@/lib/index-entity";
import { findGameFacetProfileEntity } from "@/lib/game-facet-profile";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ from?: string }>;
};

export default async function TagDetailPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  if (findGameFacetProfileEntity(slug)) {
    return <GameFacetProfileDetail slug={slug} fromCatalogId={query?.from} />;
  }
  if (summarizeIndexSlug("tag", slug)) {
    return <IndexEntityDetail kind="tag" slug={slug} />;
  }
  notFound();
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const facet = findGameFacetProfileEntity(slug);
  if (!facet) return { title: "Etiqueta no encontrada" };
  return {
    title: `${facet.name} · juegos | Region Atlas Games`,
    description: facet.description,
  };
}
