import Link from "next/link";
import { RegionFlag } from "@/components/region-flag";
import { cn } from "@/lib/cn";
import { decodeHtmlEntities } from "@/lib/decode-html-entities";
import type { CatalogGame } from "@/lib/types";

type Props = {
  game: Pick<CatalogGame, "title" | "region">;
  href: string;
  className?: string;
  /** En listas inline (referentes); por defecto fila con bandera a la derecha. */
  layout?: "row" | "inline";
};

export function CatalogGameListLink({ game, href, className, layout = "row" }: Props) {
  const title = decodeHtmlEntities(game.title);
  const region = (
    <RegionFlag
      region={game.region}
      size="xs"
      showLabel
      labelMode="short"
      className={layout === "inline" ? "ml-1 align-middle" : "shrink-0"}
    />
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
        "flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground/90 hover:bg-black/20 hover:text-accent",
        className,
      )}
    >
      <span className="min-w-0 truncate">{title}</span>
      {region}
    </Link>
  );
}
