import Link from "next/link";
import type { ReactNode } from "react";
import { CoverArt } from "@/components/cover-art";
import { RegionFlag } from "@/components/region-flag";
import type { CatalogGame, CollectionView } from "@/lib/types";
import { formatEur, getPlatform } from "@/lib/catalog";
import { getCollectionPlatformShortName } from "@/lib/collection-platform-groups";
import { catalogGamePath } from "@/lib/catalog-url";
import {
  grailLabel,
  isGrailGame,
  isTopInSegment,
  topSegmentLabel,
} from "@/lib/game-highlight";
import { formatEsPriceForCard } from "@/lib/price-display";
import { CollectionQuickAdd } from "@/components/collection-quick-add";
import { gameCardHighlightClass } from "@/lib/card-highlight";
import { cn } from "@/lib/cn";
import { getCoverSrc } from "@/lib/cover-url";
import { decodeHtmlEntities } from "@/lib/decode-html-entities";

const cardBase =
  "group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-all duration-200 ease-out hover:-translate-y-1.5 hover:shadow-xl hover:shadow-black/45 hover:bg-card-hover";

function gameHighlights(game: CatalogGame | CollectionView) {
  const grail = isGrailGame(game);
  const topSegment = isTopInSegment(game);
  return { grail, topSegment };
}

export function CatalogGameCard({
  game,
  owned = false,
  isLoggedIn = false,
  onOwnedChange,
  listingsForSale = 0,
}: {
  game: CatalogGame;
  owned?: boolean;
  isLoggedIn?: boolean;
  onOwnedChange?: (catalogId: string, owned: boolean, ownedCatalogIds?: string[]) => void;
  listingsForSale?: number;
}) {
  const platform = getPlatform(game.platformSlug);
  const { grail, topSegment } = gameHighlights(game);

  return (
    <div className={cn(cardBase, gameCardHighlightClass(owned, grail, topSegment))}>
      <Link href={catalogGamePath(game)} className="flex flex-1 flex-col">
        <CoverSlot
          image={getCoverSrc(game.coverUrl, game.id)}
          title={decodeHtmlEntities(game.title)}
          platformSlug={game.platformSlug}
          owned={owned}
          grail={grail}
          topSegment={topSegment}
          hideOwnedBadge
        />
        <CardBody
          title={decodeHtmlEntities(game.title)}
          platform={platform?.shortName ?? game.platformSlug}
          region={game.region}
          price={formatEsPriceForCard(game, formatEur)}
          priceVerified={game.priceRegionVerified === true}
          priceUnverified={game.hasEsPrice && game.priceRegionVerified !== true}
          grail={grail}
          topSegment={topSegment}
          listingsForSale={listingsForSale}
        />
      </Link>
      <CollectionQuickAdd
        catalogId={game.id}
        owned={owned}
        isLoggedIn={isLoggedIn}
        onChange={onOwnedChange}
        className="absolute right-1.5 top-1.5 z-10"
      />
    </div>
  );
}

export function CollectionGameCard({
  game,
  overlayAction,
}: {
  game: CollectionView;
  overlayAction?: ReactNode;
}) {
  const platformLabel = getCollectionPlatformShortName(game.platformSlug);
  const href = game.catalogId ? catalogGamePath(game.catalogId) : `/coleccion/${game.id}`;
  const { grail, topSegment } = gameHighlights(game);
  const priceLabel =
    !game.hasEsPrice && game.recommendedPrice != null
      ? formatEur(game.recommendedPrice)
      : formatEsPriceForCard(game, formatEur);

  const body = (
    <>
      <CoverSlot
        image={getCoverSrc(game.coverUrl, game.catalogId ?? game.id)}
        title={decodeHtmlEntities(game.title)}
        platformSlug={game.platformSlug}
        sealed={game.sealed}
        platform={platformLabel}
        owned
        grail={grail}
        topSegment={topSegment}
      />
      <CardBody
        title={decodeHtmlEntities(game.title)}
        platform={platformLabel}
        price={priceLabel}
        priceVerified={game.priceRegionVerified === true}
        priceUnverified={game.hasEsPrice && game.priceRegionVerified !== true}
        importPrice={!game.hasEsPrice && game.recommendedPrice != null}
        quantity={game.quantity}
        grail={grail}
        topSegment={topSegment}
      />
    </>
  );

  if (overlayAction) {
    return (
      <div className={cn(cardBase, gameCardHighlightClass(true, grail, topSegment), "relative")}>
        <Link href={href} className="flex flex-1 flex-col">
          {body}
        </Link>
        {overlayAction}
      </div>
    );
  }

  return (
    <Link href={href} className={cn(cardBase, gameCardHighlightClass(true, grail, topSegment))}>
      {body}
    </Link>
  );
}

function CoverSlot({
  image,
  title,
  platformSlug,
  sealed,
  platform,
  owned,
  grail,
  topSegment,
  hideOwnedBadge,
}: {
  image: string | null;
  title: string;
  platformSlug?: string;
  sealed?: boolean;
  platform?: string;
  owned?: boolean;
  grail?: boolean;
  topSegment?: boolean;
  hideOwnedBadge?: boolean;
}) {
  return (
    <div className="relative">
      <CoverArt
        src={image}
        alt={title}
        platformSlug={platformSlug}
        variant="card"
        className="rounded-none border-0 shadow-none"
      />
      <div className="absolute left-1.5 top-1.5 flex flex-wrap gap-1">
        {platform && (
          <span className="rounded-md bg-black/75 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-accent/90">
            {platform}
          </span>
        )}
        {topSegment && (
          <span
            className="rounded-md border border-violet-300/40 bg-violet-500/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-violet-50"
            title={topSegmentLabel()}
          >
            Top
          </span>
        )}
        {grail && (
          <span
            className="rounded-md border border-amber-400/40 bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-950"
            title={grailLabel()}
          >
            Rareza
          </span>
        )}
        {sealed && (
          <span className="rounded-md bg-emerald-600/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">
            Precintado
          </span>
        )}
      </div>
      <div className="absolute right-1.5 top-1.5 flex flex-col gap-1">
        {owned && !hideOwnedBadge && (
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full border border-emerald-400/50 bg-emerald-600/90 text-white shadow-md"
            title="En tu colección"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        )}
      </div>
    </div>
  );
}

function CardBody({
  title,
  platform,
  region,
  price,
  quantity,
  grail,
  topSegment,
  listingsForSale,
  priceUnverified,
  importPrice,
}: {
  title: string;
  platform: string;
  region?: string;
  price: string;
  quantity?: number;
  grail?: boolean;
  topSegment?: boolean;
  listingsForSale?: number;
  priceVerified?: boolean;
  priceUnverified?: boolean;
  importPrice?: boolean;
}) {
  const tags = [
    topSegment ? "Top región" : null,
    grail ? "Rareza" : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-1 flex-col gap-1.5 p-3">
      <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">{title}</h3>
      <div className="mt-auto flex items-end justify-between gap-2 pt-1">
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-1 truncate text-[10px] uppercase tracking-wider text-muted">
            <span className="truncate">{platform}</span>
            {region && (
              <>
                <span aria-hidden className="text-muted/50">
                  ·
                </span>
                <RegionFlag region={region} size="xs" />
              </>
            )}
            {tags.length > 0 && (
              <span className="truncate normal-case tracking-normal">
                {tags.length > 0 ? ` · ${tags.join(" · ")}` : ""}
              </span>
            )}
          </p>
          <p
            className={cn(
              "text-base font-bold",
              importPrice
                ? "text-muted"
                : priceUnverified
                  ? "text-muted"
                  : grail
                    ? "text-amber-300"
                    : topSegment
                      ? "text-violet-300"
                      : "text-accent",
            )}
          >
            {price}
          </p>
          {importPrice && (
            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">Ref. import</p>
          )}
          {listingsForSale != null && listingsForSale > 0 && (
            <p className="mt-0.5 text-[11px] font-medium text-violet-300">
              {listingsForSale} en venta
            </p>
          )}
        </div>
      </div>
      {quantity != null && quantity > 1 && (
        <p className="text-[11px] text-muted">×{quantity} unidades</p>
      )}
    </div>
  );
}
