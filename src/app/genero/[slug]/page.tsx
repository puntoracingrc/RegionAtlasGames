import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { GenreProfileDetail } from "@/components/genre-profile-detail";
import { resolveCanonicalGenreSlug } from "@/lib/genre-canonical";
import { buildGenreProfileView } from "@/lib/genre-profile";
import { buildGenreMetadata } from "@/lib/genre-seo";
import { getOwnedCatalogIds } from "@/lib/collection-store";
import { getCurrentUser } from "@/lib/users";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const view = buildGenreProfileView(resolveCanonicalGenreSlug(slug));
  if (!view) return { title: "Género no encontrado" };
  return buildGenreMetadata(view);
}

export default async function GenrePage({ params }: Props) {
  const { slug } = await params;
  const canonicalSlug = resolveCanonicalGenreSlug(slug);
  if (canonicalSlug !== slug) {
    redirect(`/genero/${canonicalSlug}`);
  }

  const view = buildGenreProfileView(canonicalSlug);
  if (!view) notFound();

  const user = await getCurrentUser();
  const ownedCatalogIds = user ? await getOwnedCatalogIds(user.id) : [];

  return (
    <GenreProfileDetail
      view={view}
      ownedCatalogIds={ownedCatalogIds}
      isLoggedIn={!!user}
    />
  );
}
