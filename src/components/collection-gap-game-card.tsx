"use client";

import { CollectionGapLinkButton } from "@/components/collection-gap-link-button";
import { CollectionGameCard } from "@/components/game-card";
import type { CollectionView } from "@/lib/types";

type Props = {
  game: CollectionView;
};

export function CollectionGapGameCard({ game }: Props) {
  if (!game.availableCatalogId) {
    return <CollectionGameCard game={game} />;
  }

  return (
    <CollectionGameCard
      game={game}
      overlayAction={
        <CollectionGapLinkButton
          collectionItemId={game.id}
          className="absolute right-1.5 top-1.5 z-10"
        />
      }
    />
  );
}
