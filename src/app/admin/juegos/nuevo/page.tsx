import { AdminNewGameForm } from "@/components/admin/admin-new-game-form";
import { platformOptions, REGION_OPTIONS } from "@/lib/admin-draft-storage";

export default function AdminNewGamePage() {
  const platforms = platformOptions().map((p) => ({ slug: p.slug, name: p.name }));

  return <AdminNewGameForm platforms={platforms} regions={REGION_OPTIONS} />;
}
