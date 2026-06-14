import { redirect } from "next/navigation";
import { IndexEntityDetail } from "@/components/index-entity-detail";
import { resolveCanonicalCompanySlug } from "@/lib/company-canonical";

type Props = { params: Promise<{ slug: string }> };

export default async function CompanyPage({ params }: Props) {
  const { slug } = await params;
  const canonicalSlug = resolveCanonicalCompanySlug(slug);
  if (canonicalSlug !== slug) {
    redirect(`/compania/${canonicalSlug}`);
  }
  return <IndexEntityDetail kind="company" slug={slug} />;
}
