import { AdminManagementPanel } from "@/components/admin/admin-management-panel";
import { listAdminCompanies } from "@/lib/admin-entity-catalog";
import { platformOptions, REGION_OPTIONS } from "@/lib/admin-draft-storage";
import { getAdminGameEditorTaxonomyOptions } from "@/lib/admin-game-editor-options";

export default async function AdminManagementPage() {
  const platforms = platformOptions().map((platform) => ({
    slug: platform.slug,
    name: platform.name,
  }));
  const companies = (await listAdminCompanies({ limit: 500 })).map((company) => ({
    slug: company.slug,
    name: company.name,
  }));
  const taxonomyOptions = getAdminGameEditorTaxonomyOptions();

  return (
    <AdminManagementPanel
      platforms={platforms}
      regions={REGION_OPTIONS}
      companies={companies}
      taxonomyOptions={taxonomyOptions}
    />
  );
}
