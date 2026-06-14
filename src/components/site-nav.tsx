"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthNav } from "@/components/auth-nav";
import { SiteLogo } from "@/components/site-logo";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/", label: "Inicio" },
  { href: "/plataformas", label: "Plataformas" },
  { href: "/compania", label: "Compañías" },
  { href: "/genero", label: "Géneros" },
  { href: "/coleccion", label: "Mi colección" },
  { href: "/ajustes", label: "Ajustes" },
];

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      className="h-5 w-5 text-foreground"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      {open ? (
        <>
          <path d="M6 6l12 12M18 6L6 18" />
        </>
      ) : (
        <>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </>
      )}
    </svg>
  );
}

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-nav backdrop-blur-md">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-2.5 md:px-6">
        <SiteLogo priority />

        <div className="flex items-center justify-end gap-2 sm:gap-3 md:gap-5">
          <div className="hidden items-center gap-x-4 text-[13px] text-muted sm:flex">
            {LINKS.filter((link) => link.href !== "/ajustes").map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="transition hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <AuthNav />

          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-foreground transition hover:bg-card-hover sm:hidden"
            aria-expanded={open}
            aria-controls="site-mobile-menu"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            onClick={() => setOpen((value) => !value)}
          >
            <MenuIcon open={open} />
          </button>
        </div>
      </div>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 top-[53px] z-40 bg-black/40 sm:hidden"
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
          />
          <div
            id="site-mobile-menu"
            className="relative z-50 border-t border-border bg-nav px-4 py-3 sm:hidden"
          >
            <ul className="space-y-1">
              {LINKS.map((link) => {
                const active =
                  link.href === "/"
                    ? pathname === "/"
                    : pathname === link.href || pathname.startsWith(`${link.href}/`);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={cn(
                        "block rounded-lg px-3 py-2.5 text-sm transition",
                        active
                          ? "bg-accent/15 font-medium text-accent"
                          : "text-foreground/90 hover:bg-card-hover hover:text-foreground",
                      )}
                      onClick={() => setOpen(false)}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </nav>
  );
}
