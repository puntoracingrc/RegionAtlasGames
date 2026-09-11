import Link from "next/link";
import { Heart, LibraryBig } from "lucide-react";
import { cn } from "@/lib/cn";
import { WishlistUnreadBadge } from "@/components/wishlist-unread-badge";

export function CollectionTabs({ active, desiredCount }: { active: "collection" | "wishlist"; desiredCount: number }) {
  return (
    <nav aria-label="Secciones de mi colección" className="mb-6 flex gap-2 border-b border-border pb-3">
      {[{ id: "collection", href: "/coleccion", label: "Mi colección", Icon: LibraryBig }, { id: "wishlist", href: "/coleccion/deseados", label: "Mis deseados", Icon: Heart }].map(({ id, href, label, Icon }) => (
        <Link key={id} href={href} aria-current={active === id ? "page" : undefined} className={cn("inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition sm:px-4", active === id ? "bg-accent text-accent-fg" : "bg-card text-muted hover:bg-card-hover hover:text-foreground")}>
          <Icon aria-hidden className="h-4 w-4 shrink-0" />{label}
          {id === "wishlist" && <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-xs [.dark_&]:bg-white/10">{desiredCount}</span>}
          {id === "wishlist" && <WishlistUnreadBadge />}
        </Link>
      ))}
    </nav>
  );
}
