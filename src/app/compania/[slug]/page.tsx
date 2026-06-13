import { IndexEntityDetail } from "@/components/index-entity-detail";

type Props = { params: Promise<{ slug: string }> };

export default async function CompanyPage({ params }: Props) {
  const { slug } = await params;
  return <IndexEntityDetail kind="company" slug={slug} />;
}
