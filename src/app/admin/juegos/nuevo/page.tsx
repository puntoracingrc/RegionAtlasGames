import { AdminNewGameForm } from "@/components/admin/admin-new-game-form";
import { listAdminCompanies } from "@/lib/admin-entity-catalog";
import { platformOptions, REGION_OPTIONS } from "@/lib/admin-draft-storage";
import { getAdminGameEditorTaxonomyOptions } from "@/lib/admin-game-editor-options";

export default async function AdminNewGamePage() {
  const platforms = platformOptions().map((p) => ({ slug: p.slug, name: p.name }));
  const companies = (await listAdminCompanies({ limit: 500 })).map((company) => ({
    slug: company.slug,
    name: company.name,
  }));
  const taxonomyOptions = getAdminGameEditorTaxonomyOptions();

  return (
    <AdminNewGameForm
      platforms={platforms}
      regions={REGION_OPTIONS}
      companies={companies}
      taxonomyOptions={taxonomyOptions}
    />
  );
}
