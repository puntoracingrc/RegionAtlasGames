import { AdminAiToolsPanel } from "@/components/admin/admin-ai-tools-panel";
import { platformOptions, REGION_OPTIONS } from "@/lib/admin-draft-storage";

export default function AdminAiPage() {
  const platforms = platformOptions().map((platform) => ({
    slug: platform.slug,
    name: platform.name,
    shortName: platform.shortName,
  }));

  return <AdminAiToolsPanel platforms={platforms} regions={REGION_OPTIONS} />;
}
