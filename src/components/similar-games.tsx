import { CatalogGameCard } from "@/components/game-card";
import { toCatalogListGame } from "@/lib/catalog-list-game";
import type { CatalogGame } from "@/lib/types";
import { Panel, PanelTitle } from "@/components/ui";

const SIMILAR_GAMES_GRID_CLASS =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4";

export function SimilarGames({ games }: { games: CatalogGame[] }) {
  if (games.length === 0) return null;
  const listGames = games.map(toCatalogListGame);

  return (
    <Panel>
      <PanelTitle>Coleccionistas también buscan</PanelTitle>
      <div className={SIMILAR_GAMES_GRID_CLASS}>
        {listGames.map((game) => (
          <CatalogGameCard key={game.id} game={game} />
        ))}
      </div>
    </Panel>
  );
}
