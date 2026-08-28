import { AdminCatalogAiCampaignPanel } from "@/components/admin/admin-catalog-ai-campaign-panel";
import { AdminAiToolsPanel } from "@/components/admin/admin-ai-tools-panel";
import { platformOptions, REGION_OPTIONS } from "@/lib/admin-draft-storage";
import { listLocalGameRunnerJobs, localGameRunnerTokenConfigured } from "@/lib/local-game-runner-jobs";

export default async function AdminAiPage() {
  const platforms = platformOptions().map((platform) => ({
    slug: platform.slug,
    name: platform.name,
    shortName: platform.shortName,
  }));
  const localJobs = await listLocalGameRunnerJobs(30);

  return (
    <div className="space-y-6">
      <AdminCatalogAiCampaignPanel
        initialJobs={localJobs}
        tokenConfigured={localGameRunnerTokenConfigured()}
      />
      <AdminAiToolsPanel platforms={platforms} regions={REGION_OPTIONS} />
    </div>
  );
}
