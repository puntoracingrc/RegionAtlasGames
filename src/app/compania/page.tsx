import { IndexEntityList } from "@/components/index-entity-list";

export const dynamic = "force-dynamic";

export default function CompaniesPage() {
  return <IndexEntityList kind="company" />;
}
