"use client";

import { CollectionGapLinkButton } from "@/components/collection-gap-link-button";
import { CollectionGameCard } from "@/components/game-card";
import type { CollectionView } from "@/lib/types";

type Props = {
  game: CollectionView;
};

export function CollectionGapGameCard({ game }: Props) {
  const linkable = Boolean(game.availableCatalogId);

  if (!linkable) {
    return <CollectionGameCard game={game} />;
  }

  return (
    <div className="relative rounded-xl ring-2 ring-emerald-400/40">
      <span
        className="pointer-events-none absolute left-1.5 top-1.5 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-emerald-300/60 bg-emerald-600/95 text-xs font-bold text-white shadow-md"
        title="Ficha disponible — pulsa + para enlazar"
        aria-hidden
      >
        +
      </span>
      <CollectionGameCard
        game={game}
        overlayAction={
          <CollectionGapLinkButton
            collectionItemId={game.id}
            className="absolute right-1.5 top-1.5 z-10"
          />
        }
      />
    </div>
  );
}
