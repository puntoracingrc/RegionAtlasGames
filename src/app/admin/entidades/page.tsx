import { AdminEntitiesPanel } from "@/components/admin/admin-entities-panel";

type AdminEntitiesPageProps = {
  searchParams: Promise<{ tab?: string }>;
};

const entityTabs = ["platforms", "companies", "genres", "franchises", "series"] as const;

type EntityTab = (typeof entityTabs)[number];

function isEntityTab(value: string | undefined): value is EntityTab {
  return entityTabs.some((tab) => tab === value);
}

export default async function AdminEntitiesPage({ searchParams }: AdminEntitiesPageProps) {
  const { tab } = await searchParams;
  return <AdminEntitiesPanel initialTab={isEntityTab(tab) ? tab : "platforms"} />;
}
