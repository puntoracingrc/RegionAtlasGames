"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthNav } from "@/components/auth-nav";
import { SiteLogo } from "@/components/site-logo";
import { cn } from "@/lib/cn";
import type { PublicUser } from "@/lib/session";
import { IntentLink } from "@/components/intent-link";
import { LinkPendingFeedback } from "@/components/link-pending-feedback";

const LINKS = [
  { href: "/", label: "Inicio" },
  { href: "/plataformas", label: "Plataformas" },
  { href: "/compania", label: "Compañías" },
  { href: "/persona", label: "Personas" },
  { href: "/saga", label: "Sagas" },
  { href: "/vitrina", label: "Vitrina" },
  { href: "/coleccion", label: "Mi colección" },
];

const ADMIN_LINK = { href: "/admin", label: "Admin" };
const CONTRIBUTOR_LINK = { href: "/contribuir", label: "Contribuir" };
type StaffRole = "admin" | "contributor" | null;

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

export function SiteNav({
  initialStaffRole,
  initialUser,
  sticky = true,
}: {
  initialStaffRole?: StaffRole;
  initialUser?: PublicUser | null;
  sticky?: boolean;
} = {}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [staffRole, setStaffRole] = useState<StaffRole>(initialStaffRole ?? null);

  useEffect(() => {
    if (initialStaffRole !== undefined) return;
    let cancelled = false;
    fetch("/api/admin/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && (data?.role === "admin" || data?.role === "contributor")) {
          setStaffRole(data.role);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialStaffRole]);

  const navLinks =
    staffRole === "admin"
      ? [...LINKS, ADMIN_LINK]
      : staffRole === "contributor"
        ? [...LINKS, CONTRIBUTOR_LINK]
        : LINKS;

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <nav
      className={cn(
        "z-50 border-b border-border bg-nav backdrop-blur-md",
        sticky ? "sticky top-0" : "relative",
      )}
    >
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-2.5 md:px-6">
        <SiteLogo priority />

        <div className="flex items-center justify-end gap-2 sm:gap-3 md:gap-5">
          <div className="hidden items-center gap-x-3 text-[13px] text-muted lg:flex xl:gap-x-4">
            {LINKS.map((link) => (
              <IntentLink
                key={link.href}
                href={link.href}
                className={cn(
                  "transition hover:text-foreground",
                  link.href === "/"
                    ? pathname === "/" && "font-medium text-foreground"
                    : (pathname === link.href || pathname.startsWith(`${link.href}/`)) &&
                        "font-medium text-foreground",
                )}
              >
                {link.label}
                <LinkPendingFeedback label={`Abriendo ${link.label}…`} />
              </IntentLink>
            ))}
          </div>

          <AuthNav initialUser={initialUser} />

          {staffRole === "admin" && (
            <IntentLink
              href="/admin"
              className="hidden rounded-md px-2 py-1.5 text-[13px] font-medium text-violet-700 transition hover:text-violet-900 dark:text-violet-300 lg:inline"
            >
              Admin
              <LinkPendingFeedback label="Abriendo administración…" />
            </IntentLink>
          )}
          {staffRole === "contributor" && (
            <IntentLink
              href="/contribuir"
              className="hidden rounded-md px-2 py-1.5 text-[13px] font-medium text-emerald-700 transition hover:text-emerald-900 dark:text-emerald-300 lg:inline"
            >
              Contribuir
              <LinkPendingFeedback label="Abriendo contribuciones…" />
            </IntentLink>
          )}

          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-foreground transition hover:bg-card-hover lg:hidden"
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
            className="fixed inset-0 top-[53px] z-40 bg-black/40 lg:hidden"
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
          />
          <div
            id="site-mobile-menu"
            className="relative z-50 border-t border-border bg-nav px-4 py-3 lg:hidden"
          >
            <ul className="space-y-1">
              {navLinks.map((link) => {
                const active =
                  link.href === "/"
                    ? pathname === "/"
                    : pathname === link.href || pathname.startsWith(`${link.href}/`);
                return (
                  <li key={link.href}>
                    <IntentLink
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
                      <LinkPendingFeedback label={`Abriendo ${link.label}…`} />
                    </IntentLink>
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
