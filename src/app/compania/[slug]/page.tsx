import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CompanyProfileDetail } from "@/components/company-profile-detail";
import { resolveCanonicalCompanySlug } from "@/lib/company-canonical";
import { buildCompanyProfileView } from "@/lib/company-profile";
import { buildCompanyMetadata } from "@/lib/company-seo";
import { getOwnedCatalogIds } from "@/lib/collection-store";
import { getCurrentUser } from "@/lib/users";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const view = buildCompanyProfileView(resolveCanonicalCompanySlug(slug));
  if (!view) return { title: "Compañía no encontrada" };
  return buildCompanyMetadata(view);
}

export default async function CompanyPage({ params }: Props) {
  const { slug } = await params;
  const canonicalSlug = resolveCanonicalCompanySlug(slug);
  if (canonicalSlug !== slug) {
    redirect(`/compania/${canonicalSlug}`);
  }

  const view = buildCompanyProfileView(canonicalSlug);
  if (!view) notFound();

  const user = await getCurrentUser();
  const ownedCatalogIds = user ? await getOwnedCatalogIds(user.id) : [];

  return (
    <CompanyProfileDetail
      view={view}
      ownedCatalogIds={ownedCatalogIds}
      isLoggedIn={!!user}
    />
  );
}
