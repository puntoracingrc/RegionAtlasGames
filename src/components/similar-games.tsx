import { CatalogGameCard } from "@/components/game-card";
import type { CatalogGame } from "@/lib/types";
import { Panel, PanelTitle } from "@/components/ui";

const SIMILAR_GAMES_GRID_CLASS =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4";

export function SimilarGames({ games }: { games: CatalogGame[] }) {
  if (games.length === 0) return null;

  return (
    <Panel>
      <PanelTitle>Coleccionistas también buscan</PanelTitle>
      <div className={SIMILAR_GAMES_GRID_CLASS}>
        {games.map((game) => (
          <CatalogGameCard key={game.id} game={game} />
        ))}
      </div>
    </Panel>
  );
}
