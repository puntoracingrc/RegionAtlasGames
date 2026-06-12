import Link from "next/link";
import type { CatalogGame, CollectionItem } from "@/lib/types";
import { formatEur } from "@/lib/catalog";
import { Panel, PanelTitle } from "@/components/ui";

type GameLike = Pick<
  CatalogGame | CollectionItem,
  | "cexSellPrice"
  | "cexCashPrice"
  | "cexProductUrl"
  | "jgoRetailPrice"
  | "jgoProductUrl"
  | "jgoCondition"
  | "jgoInStock"
  | "cholloRetailPrice"
  | "cholloProductUrl"
  | "cholloCondition"
  | "cholloInStock"
  | "kaotoRetailPrice"
  | "kaotoProductUrl"
  | "kaotoCondition"
  | "kaotoInStock"
>;

const CONDITION_LABELS: Record<string, string> = {
  used: "Usado / suelto",
  no_manual: "Sin manual",
  cib: "Completo (CIB)",
  sealed: "Precintado",
  unknown: "Sin especificar",
};

function formatCondition(condition: string | null | undefined): string | null {
  if (!condition) return null;
  return CONDITION_LABELS[condition] ?? condition;
}

function RetailCard({
  label,
  price,
  condition,
  inStock,
  url,
  linkLabel,
}: {
  label: string;
  price: number;
  condition?: string | null;
  inStock?: boolean;
  url?: string | null;
  linkLabel: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold text-foreground">{formatEur(price)}</p>
      <p className="mt-1 text-xs text-muted">
        {formatCondition(condition) ?? "Tienda especializada (ES)"}
        {inStock === false ? " · Agotado" : inStock ? " · En stock" : ""}
      </p>
      {url && (
        <Link
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-xs text-accent hover:underline"
        >
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

export function RetailPriceReferences({ game }: { game: GameLike }) {
  const hasCex = game.cexSellPrice != null || game.cexCashPrice != null;
  const hasJgo = game.jgoRetailPrice != null;
  const hasChollo = game.cholloRetailPrice != null;
  const hasKaoto = game.kaotoRetailPrice != null;

  if (!hasCex && !hasJgo && !hasChollo && !hasKaoto) return null;

  return (
    <Panel>
      <PanelTitle>Referencias retail (aparte del P2P)</PanelTitle>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {hasCex && (
          <div className="rounded-xl border border-border bg-background/40 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">CeX</p>
            <div className="mt-2 space-y-1 text-sm">
              {game.cexSellPrice != null && (
                <p>
                  Venta:{" "}
                  <span className="font-semibold text-foreground">
                    {formatEur(game.cexSellPrice)}
                  </span>
                </p>
              )}
              {game.cexCashPrice != null && (
                <p className="text-muted">Compra: {formatEur(game.cexCashPrice)}</p>
              )}
            </div>
            {game.cexProductUrl && (
              <Link
                href={game.cexProductUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-xs text-accent hover:underline"
              >
                Ver en CeX →
              </Link>
            )}
          </div>
        )}

        {hasJgo && game.jgoRetailPrice != null && (
          <RetailCard
            label="Japan Game Online"
            price={game.jgoRetailPrice}
            condition={game.jgoCondition}
            inStock={game.jgoInStock}
            url={game.jgoProductUrl}
            linkLabel="Ver en japangameonline.com →"
          />
        )}

        {hasChollo && game.cholloRetailPrice != null && (
          <RetailCard
            label="Chollo Games"
            price={game.cholloRetailPrice}
            condition={game.cholloCondition}
            inStock={game.cholloInStock}
            url={game.cholloProductUrl}
            linkLabel="Ver en chollogames.es →"
          />
        )}

        {hasKaoto && game.kaotoRetailPrice != null && (
          <RetailCard
            label="Kaoto Store"
            price={game.kaotoRetailPrice}
            condition={game.kaotoCondition}
            inStock={game.kaotoInStock}
            url={game.kaotoProductUrl}
            linkLabel="Ver en kaotostore.com →"
          />
        )}
      </div>
    </Panel>
  );
}

type ImportRetailGame = Pick<
  CatalogGame | CollectionItem,
  | "region"
  | "jgoRetailPrice"
  | "cholloRetailPrice"
  | "kaotoRetailPrice"
  | "jgoMatchedAt"
  | "cholloMatchedAt"
  | "kaotoMatchedAt"
>;

export function hasRetailPriceReference(
  game: Pick<
    CatalogGame | CollectionItem,
    "cexSellPrice" | "cexCashPrice" | "jgoRetailPrice" | "cholloRetailPrice" | "kaotoRetailPrice"
  >,
): boolean {
  return (
    game.cexSellPrice != null ||
    game.cexCashPrice != null ||
    game.jgoRetailPrice != null ||
    game.cholloRetailPrice != null ||
    game.kaotoRetailPrice != null
  );
}

export function hasJapanRetailReference(game: ImportRetailGame): boolean {
  const region = (game.region || "").toLowerCase();
  return (
    (region === "japón" || region === "japan") &&
    (game.jgoRetailPrice != null ||
      game.cholloRetailPrice != null ||
      game.kaotoRetailPrice != null)
  );
}

type RetailOffer = { source: string; price: number; matchedAt?: string | null };

function importRetailOffers(game: ImportRetailGame): RetailOffer[] {
  const offers: RetailOffer[] = [];
  if (game.jgoRetailPrice != null) {
    offers.push({ source: "Japan Game Online", price: game.jgoRetailPrice, matchedAt: game.jgoMatchedAt });
  }
  if (game.cholloRetailPrice != null) {
    offers.push({ source: "Chollo Games", price: game.cholloRetailPrice, matchedAt: game.cholloMatchedAt });
  }
  if (game.kaotoRetailPrice != null) {
    offers.push({ source: "Kaoto Store", price: game.kaotoRetailPrice, matchedAt: game.kaotoMatchedAt });
  }
  return offers;
}

export function bestJapanRetailPrice(game: ImportRetailGame): number | null {
  const prices = importRetailOffers(game).map((o) => o.price);
  if (prices.length === 0) return null;
  return Math.min(...prices);
}

export function bestJapanRetailSource(game: ImportRetailGame): string {
  const offers = importRetailOffers(game);
  if (offers.length === 0) return "Retail";
  return offers.sort((a, b) => a.price - b.price)[0].source;
}

export function latestJapanRetailMatchedAt(game: ImportRetailGame): string | null {
  const offers = importRetailOffers(game);
  const dates = offers.map((o) => o.matchedAt).filter(Boolean) as string[];
  if (dates.length === 0) return null;
  return dates.sort().at(-1) ?? null;
}
