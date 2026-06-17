import { AdminCatalogImportPanel } from "@/components/admin/admin-catalog-import-panel";
import { REGION_OPTIONS } from "@/lib/admin-draft-storage";
import { listAdminPlatforms } from "@/lib/admin-entity-catalog";

export default async function AdminCatalogImportPage() {
  const platforms = (await listAdminPlatforms()).map((platform) => ({
    slug: platform.slug,
    name: platform.name,
    shortName: platform.shortName,
    active: platform.active !== false,
  }));

  return <AdminCatalogImportPanel platforms={platforms} regions={REGION_OPTIONS} />;
}
