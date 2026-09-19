import { AdminRegionalVariantBatchForm } from "@/components/admin/admin-regional-variant-batch-form";
import { adminMarketOptions } from "@/lib/admin-regional-variant-batch";
import { platformOptions } from "@/lib/admin-draft-storage";

export default function AdminRegionalVariantBatchPage() {
  return (
    <AdminRegionalVariantBatchForm
      platforms={platformOptions().map((platform) => ({ slug: platform.slug, name: platform.name }))}
      marketOptions={adminMarketOptions()}
    />
  );
}
