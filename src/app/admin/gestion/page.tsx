import { AdminManagementPanel } from "@/components/admin/admin-management-panel";
import { platformOptions, REGION_OPTIONS } from "@/lib/admin-draft-storage";

export default function AdminManagementPage() {
  const platforms = platformOptions().map((platform) => ({
    slug: platform.slug,
    name: platform.name,
  }));

  return <AdminManagementPanel platforms={platforms} regions={REGION_OPTIONS} />;
}
