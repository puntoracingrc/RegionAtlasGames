import { AdminNewGameForm } from "@/components/admin/admin-new-game-form";
import { platformOptions, REGION_OPTIONS } from "@/lib/admin-draft-storage";

export default function ContribuirNewGamePage() {
  const platforms = platformOptions().map((p) => ({ slug: p.slug, name: p.name }));

  return (
    <AdminNewGameForm
      platforms={platforms}
      regions={REGION_OPTIONS}
      createApiUrl="/api/contribuir/games"
      similarApiUrl="/api/contribuir/games/similar"
      redirectBase="/contribuir"
      contributorMode
    />
  );
}
