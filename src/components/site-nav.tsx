"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { AuthNav } from "@/components/auth-nav";
import { SiteLogo } from "@/components/site-logo";
import { cn } from "@/lib/cn";
import type { PublicUser } from "@/lib/session";
import { IntentLink } from "@/components/intent-link";
import { LinkPendingFeedback } from "@/components/link-pending-feedback";

const LINKS = [
  { href: "/", label: "Inicio" },
  { href: "/vitrina", label: "Vitrina" },
  { href: "/plataformas", label: "Plataformas" },
  { href: "/coleccion", label: "Mi colección" },
];

const INDUSTRY_LINKS = [
  { href: "/compania", label: "Compañías" },
  { href: "/persona", label: "Personas" },
  { href: "/premios", label: "Premios" },
  { href: "/franquicia", label: "Franquicias" },
];

function isIndustrySection(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
    || (href === "/franquicia" && (pathname === "/saga" || pathname.startsWith("/saga/")));
}

function IndustryNavigation({ pathname, mobile = false, onNavigate }: {
  pathname: string;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const active = INDUSTRY_LINKS.some(({ href }) => isIndustrySection(pathname, href));

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target) && ref.current) {
        ref.current.open = false;
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  return (
    <details ref={ref} className="group relative" onKeyDown={(event) => {
      if (event.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
        event.stopPropagation();
      }
    }} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
    }}>
      <summary className={cn(
        "flex cursor-pointer list-none items-center gap-1.5 rounded-md transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent [&::-webkit-details-marker]:hidden",
        mobile && "px-3 py-2.5 text-sm",
        active ? "font-medium text-accent" : "text-muted",
      )}>
        Industria <ChevronDown aria-hidden className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <ul className={cn(
        "space-y-1",
        mobile ? "ml-3 border-l border-border pl-2" : "absolute right-0 top-full z-50 mt-3 min-w-48 rounded-lg border border-border bg-card p-2 shadow-lg",
      )}>
        {INDUSTRY_LINKS.map(({ href, label }) => {
          const selected = isIndustrySection(pathname, href);
          return <li key={href}>
            <IntentLink href={href} aria-current={selected ? "page" : undefined}
              className={cn("block rounded-md px-3 py-2.5 text-sm transition hover:bg-card-hover focus-visible:outline-2 focus-visible:outline-accent", selected ? "font-medium text-accent" : "text-foreground")}
              onClick={() => { if (ref.current) ref.current.open = false; onNavigate?.(); }}>
              {label}<LinkPendingFeedback label={`Abriendo ${label}…`} />
            </IntentLink>
          </li>;
        })}
      </ul>
    </details>
  );
}

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
            <IndustryNavigation pathname={pathname} />
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

      {INDUSTRY_LINKS.some(({ href }) => isIndustrySection(pathname, href)) && (
        <nav aria-label="Secciones de Industria" className="border-t border-border/70">
          <ul className="mx-auto flex max-w-[1600px] items-center gap-1 overflow-x-auto px-4 md:gap-4 md:px-6">
            {INDUSTRY_LINKS.map(({ href, label }) => {
              const selected = isIndustrySection(pathname, href);
              return (
                <li key={href} className="shrink-0">
                  <IntentLink
                    href={href}
                    aria-current={selected ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "block whitespace-nowrap border-b-2 px-2 py-3 text-sm transition hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:px-3",
                      selected ? "border-accent font-semibold text-accent" : "border-transparent text-muted",
                    )}
                  >
                    {label}
                    <LinkPendingFeedback label={`Abriendo ${label}…`} />
                  </IntentLink>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

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
            className="relative z-50 max-h-[calc(100dvh-64px)] overflow-y-auto border-t border-border bg-nav px-4 py-3 lg:hidden"
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
              <li><IndustryNavigation pathname={pathname} mobile onNavigate={() => setOpen(false)} /></li>
            </ul>
          </div>
        </>
      )}
    </nav>
  );
}
