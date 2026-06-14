import Link from "next/link";
import { cn } from "@/lib/cn";

export type BreadcrumbItem = { label: string; href?: string };

const trailClass =
  "rounded-lg border border-white/10 bg-card/50 px-3 py-2 text-sm shadow-sm shadow-black/20";

const linkClass =
  "font-medium text-foreground/85 transition hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm";

export function BackLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-card/50 px-3 py-1.5 text-sm font-medium text-foreground/90 shadow-sm shadow-black/20 transition hover:border-accent/35 hover:bg-card/80 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      <span aria-hidden className="text-accent/90">
        ←
      </span>
      <span>{children}</span>
    </Link>
  );
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className={trailClass}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden className="text-foreground/35">
                  /
                </span>
              )}
              {isLast || !item.href ? (
                <span className={cn(isLast ? "font-semibold text-foreground" : "text-foreground/70")}>
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className={linkClass}>
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
