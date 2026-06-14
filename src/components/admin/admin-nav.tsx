"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/cola", label: "Cola importaciones" },
  { href: "/admin/juegos/nuevo", label: "Añadir juego" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-8 flex flex-wrap gap-2 border-b border-border pb-4">
      {links.map((link) => {
        const active =
          link.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-accent/15 text-accent"
                : "text-muted hover:bg-card-hover hover:text-foreground"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
      <Link
        href="/"
        className="ml-auto rounded-lg px-3 py-1.5 text-sm text-muted hover:text-foreground"
      >
        ← Volver al sitio
      </Link>
    </nav>
  );
}
