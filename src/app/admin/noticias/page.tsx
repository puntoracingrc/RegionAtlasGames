import { AdminNewsSettingsPanel } from "@/components/admin/admin-news-settings-panel";
import { readNewsCache } from "@/lib/news-cache";
import { readNewsSettings } from "@/lib/news-settings";

export default async function AdminNewsPage() {
  const [settings, cache] = await Promise.all([readNewsSettings(), readNewsCache()]);
  const cacheCounts: Record<string, number> = {};
  for (const item of cache.items ?? []) {
    if (item.section === "home") cacheCounts.home = (cacheCounts.home ?? 0) + 1;
    if (item.section === "company") cacheCounts.companies = (cacheCounts.companies ?? 0) + 1;
    if (item.section === "platform") cacheCounts[item.topic] = (cacheCounts[item.topic] ?? 0) + 1;
  }

  return <AdminNewsSettingsPanel initialSettings={settings} cacheCounts={cacheCounts} />;
}
