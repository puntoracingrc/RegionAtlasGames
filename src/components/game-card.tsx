import Link from "next/link";
import type { ReactNode } from "react";
import { CoverArt } from "@/components/cover-art";
import { RegionFlag } from "@/components/region-flag";
import type { CatalogListGame, CollectionView } from "@/lib/types";
import { catalogGamePath } from "@/lib/catalog-path";
import { formatEsPriceForCard } from "@/lib/price-display";
import { formatEur } from "@/lib/price-format";
import { CollectionQuickAdd } from "@/components/collection-quick-add";
import { gameCardHighlightClass } from "@/lib/card-highlight";
import { cn } from "@/lib/cn";
import { getCoverSrc } from "@/lib/cover-url";
import { decodeHtmlEntities } from "@/lib/decode-html-entities";

const cardBase =
  "group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-all duration-200 ease-out hover:-translate-y-1.5 hover:shadow-xl hover:shadow-black/45 hover:bg-card-hover";
const RARE_PRICE_THRESHOLD_EUR = 100;
const CLIENT_PLATFORM_LABELS: Record<string, string> = {
  "3ds": "Nintendo 3DS",
  dreamcast: "Dreamcast",
  ds: "Nintendo DS",
  gameboy: "Game Boy",
  gameboycolor: "Game Boy Color",
  gamecube: "GameCube",
  gamegear: "Game Gear",
  mastersystem: "Master System",
  megacd: "Mega-CD",
  megadrive: "Mega Drive",
  n64: "Nintendo 64",
  neogeo: "Neo Geo",
  neogeocd: "Neo Geo CD",
  neogeopocket: "Neo Geo Pocket",
  nes: "NES",
  ps1: "PS1",
  ps2: "PS2",
  ps3: "PS3",
  ps4: "PS4",
  ps5: "PS5",
  psp: "PSP",
  psvita: "PS Vita",
  saturn: "Saturn",
  sega32x: "32X",
  snes: "Super Nintendo",
  switch: "Switch",
  switch2: "Switch 2",
  wii: "Wii",
  wiiu: "Wii U",
  xbox360: "Xbox 360",
  xboxone: "Xbox One",
  xboxseriesx: "Xbox Series X|S",
};

function platformLabel(slug: string): string {
  return CLIENT_PLATFORM_LABELS[slug] ?? slug.toUpperCase();
}

function gameHighlights(game: CatalogListGame | CollectionView) {
  if ("isGrail" in game && "isTopSegment" in game) {
    return { grail: game.isGrail, topSegment: game.isTopSegment };
  }
  const price = game.recommendedPrice ?? game.pcRefPrice ?? null;
  const grail = price != null && price >= RARE_PRICE_THRESHOLD_EUR;
  const topSegment = false;
  return { grail, topSegment };
}

export function CatalogGameCard({
  game,
  owned = false,
  isLoggedIn = false,
  onOwnedChange,
  listingsForSale = 0,
}: {
  game: CatalogListGame;
  owned?: boolean;
  isLoggedIn?: boolean;
  onOwnedChange?: (catalogId: string, owned: boolean, ownedCatalogIds?: string[]) => void;
  listingsForSale?: number;
}) {
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
          platform={game.displayPlatform}
          region={game.region}
          year={game.displayYear}
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
  const collectionPlatformLabel = platformLabel(game.platformSlug);
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
        platform={collectionPlatformLabel}
        owned
        grail={grail}
        topSegment={topSegment}
      />
      <CardBody
        title={decodeHtmlEntities(game.title)}
        platform={collectionPlatformLabel}
        region={game.region}
        year={null}
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
            title="Top cotizado · consola y región"
          >
            Top
          </span>
        )}
        {grail && (
          <span
            className="rounded-md border border-amber-400/40 bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-950"
            title={`Alto valor (≥${RARE_PRICE_THRESHOLD_EUR} €)`}
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
  year,
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
  year?: number | null;
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
          <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] uppercase tracking-wider text-muted">
            <span className="max-w-full truncate">{platform}</span>
            {year != null && (
              <>
                <span aria-hidden className="text-muted/50">
                  ·
                </span>
                <span className="shrink-0 tabular-nums normal-case tracking-normal">{year}</span>
              </>
            )}
            {region && (
              <>
                <span aria-hidden className="text-muted/50">
                  ·
                </span>
                <RegionFlag
                  region={region}
                  size="xs"
                  showLabel
                  labelMode="short"
                  className="shrink-0 normal-case tracking-normal"
                />
              </>
            )}
            {tags.length > 0 && (
              <span className="min-w-0 truncate normal-case tracking-normal">
                {` · ${tags.join(" · ")}`}
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
