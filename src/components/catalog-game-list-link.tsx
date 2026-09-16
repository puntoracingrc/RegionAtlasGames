import Link from "next/link";
import { RegionFlag } from "@/components/region-flag";
import { cn } from "@/lib/cn";
import { decodeHtmlEntities } from "@/lib/decode-html-entities";
import type { CatalogGame, CatalogListGame } from "@/lib/types";

type ListLinkGame = Pick<CatalogGame, "title" | "region"> &
  Pick<Partial<CatalogListGame>, "physicalEditionGroup">;

type Props = {
  game: ListLinkGame;
  href: string;
  className?: string;
  /** En listas inline (referentes); por defecto fila con bandera a la derecha. */
  layout?: "row" | "inline";
};

export function CatalogGameListLink({ game, href, className, layout = "row" }: Props) {
  const title = decodeHtmlEntities(game.title);
  const regions = game.physicalEditionGroup?.overviewRegions.length
    ? game.physicalEditionGroup.overviewRegions
    : [game.region];
  const region = (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-x-2 gap-y-1",
        layout === "inline" ? "ml-1 align-middle" : "ml-auto max-w-[72%] justify-end",
      )}
    >
      {regions.map((regionName) => (
        <RegionFlag
          key={regionName}
          region={regionName}
          size="xs"
          showLabel
          labelMode="short"
        />
      ))}
    </span>
  );

  if (layout === "inline") {
    return (
      <Link href={href} className={cn("text-accent/90 hover:text-accent hover:underline", className)}>
        {title}
        {region}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground/90 hover:bg-card-hover hover:text-accent dark:hover:bg-black/20",
        className,
      )}
    >
      <span className="min-w-0 truncate">{title}</span>
      {region}
    </Link>
  );
}
