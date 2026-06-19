"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin", label: "Resumen", icon: "⌁" },
  { href: "/admin/cola", label: "Revisión", icon: "✓" },
  { href: "/admin/gestion", label: "Gestión", icon: "▦" },
  { href: "/admin/ia", label: "IA", icon: "✦" },
  { href: "/admin/noticias", label: "Noticias", icon: "◫" },
  { href: "/admin/precios", label: "Recolección", icon: "€" },
  { href: "/admin/importacion", label: "Importar", icon: "⇪" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-3 z-20 mb-8 flex flex-wrap gap-2 rounded-2xl border border-border/80 bg-nav/90 p-2 shadow-sm shadow-black/5 backdrop-blur dark:shadow-black/20">
      {links.map((link) => {
        const active =
          link.href === "/admin"
            ? pathname === "/admin"
            : link.href === "/admin/gestion"
              ? pathname === "/admin/gestion" ||
                pathname.startsWith("/admin/juegos") ||
                pathname.startsWith("/admin/acciones") ||
                pathname.startsWith("/admin/facetas") ||
                pathname.startsWith("/admin/colaboradores") ||
                pathname.startsWith("/admin/entidades") ||
                pathname.startsWith("/admin/taxonomia")
            : link.href === "/admin/juegos"
              ? pathname === "/admin/juegos" || /^\/admin\/juegos\/[^/]+$/.test(pathname)
              : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${
              active
                ? "bg-accent text-accent-fg shadow-sm"
                : "text-muted hover:bg-card-hover hover:text-foreground"
            }`}
          >
            <span aria-hidden="true" className="text-xs opacity-80">
              {link.icon}
            </span>
            {link.label}
          </Link>
        );
      })}
      <Link
        href="/"
        className="ml-auto inline-flex items-center rounded-xl px-3 py-2 text-sm font-medium text-muted hover:bg-card-hover hover:text-foreground"
      >
        ← Sitio público
      </Link>
    </nav>
  );
}
