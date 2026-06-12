import { CatalogGameCard } from "@/components/game-card";
import { CATALOG_GRID_CLASS } from "@/lib/cover-aspect";
import type { CatalogGame } from "@/lib/types";
import { Panel, PanelTitle } from "@/components/ui";

export function SimilarGames({ games }: { games: CatalogGame[] }) {
  if (games.length === 0) return null;

  return (
    <Panel>
      <PanelTitle>Coleccionistas también buscan</PanelTitle>
      <div className={CATALOG_GRID_CLASS}>
        {games.map((game) => (
          <CatalogGameCard key={game.id} game={game} />
        ))}
      </div>
    </Panel>
  );
}
