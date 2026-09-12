"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { AuthNav } from "@/components/auth-nav";
import { RegionFlag } from "@/components/region-flag";
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
  { href: "/escaner", label: "Escáner" },
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

type SearchResult = {
  id: string;
  title: string;
  href: string;
  platform: string;
  region: string;
  year: number | null;
  coverUrl: string | null;
};

type SearchPayload = {
  items: SearchResult[];
  total: number;
};

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
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPayload, setSearchPayload] = useState<SearchPayload>({ items: [], total: 0 });
  const [searchLoading, setSearchLoading] = useState(false);
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
    document.body.style.overflow = open || searchOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const timeout = window.setTimeout(() => searchInputRef.current?.focus(), 40);
    return () => window.clearTimeout(timeout);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen || searchQuery.trim().length < 2) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const params = new URLSearchParams({
          q: searchQuery.trim(),
          platform: "all",
          region: "all",
        });
        const response = await fetch(`/api/catalog/search?${params}`, { signal: controller.signal });
        if (!response.ok) return;
        setSearchPayload((await response.json()) as SearchPayload);
      } catch (error) {
        if (!controller.signal.aborted) console.warn("[site-search] search failed", error);
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 160);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [searchOpen, searchQuery]);

  function openSearch() {
    setOpen(false);
    setSearchOpen(true);
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchPayload({ items: [], total: 0 });
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    closeSearch();
    router.push(`/catalogo?q=${encodeURIComponent(query)}`);
  }

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

          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-foreground transition hover:bg-card-hover"
            aria-label="Buscar juego"
            aria-expanded={searchOpen}
            aria-controls="site-global-search"
            onClick={openSearch}
          >
            <Search aria-hidden className="h-5 w-5" />
          </button>

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

      {searchOpen && (
        <div id="site-global-search" className="fixed inset-0 z-[70] bg-slate-950/45 px-4 py-4 backdrop-blur-sm">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Cerrar búsqueda" onClick={closeSearch} />
          <div className="relative mx-auto mt-16 w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-slate-950/25">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-accent">Buscar juego</p>
                <p className="text-sm text-muted">Busca en todo el catálogo desde cualquier página.</p>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-foreground transition hover:bg-card-hover"
                aria-label="Cerrar búsqueda"
                onClick={closeSearch}
              >
                <X aria-hidden className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={submitSearch} className="border-b border-border p-4">
              <label className="block">
                <span className="sr-only">Buscar juego en Region Atlas</span>
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Ej. Resident Evil, Zelda, CUSA, Capcom..."
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="min-h-12 w-full rounded-xl border border-border bg-input px-4 text-base font-semibold text-foreground outline-none ring-accent/25 placeholder:text-muted focus:border-accent/45 focus:ring-2"
                  onKeyDown={(event) => {
                    if (event.key === "Escape") closeSearch();
                  }}
                />
              </label>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
                <span>
                  {searchQuery.trim().length === 1
                    ? "Escribe al menos 2 letras."
                    : searchLoading
                      ? "Buscando..."
                      : searchQuery.trim().length >= 2
                        ? `${searchPayload.total.toLocaleString("es-ES")} resultados`
                        : "Pulsa Enter para ir al catálogo."}
                </span>
                <button type="submit" className="btn-secondary min-h-9 px-3 py-1.5 text-xs" disabled={!searchQuery.trim()}>
                  Ver catálogo
                </button>
              </div>
            </form>

            <div className="max-h-[55vh] overflow-y-auto p-3">
              {searchQuery.trim().length >= 2 && searchPayload.items.length === 0 && !searchLoading ? (
                <div className="rounded-xl border border-dashed border-border bg-background/45 p-4 text-sm text-muted">
                  No he encontrado fichas con ese texto. Prueba con menos palabras.
                </div>
              ) : (
                <div className="grid gap-2">
                  {searchPayload.items.slice(0, 8).map((game) => (
                    <IntentLink
                      key={game.id}
                      href={game.href}
                      className="group flex min-h-[74px] items-center gap-3 rounded-xl border border-border bg-background/45 p-2 transition hover:border-accent/40 hover:bg-card-hover"
                      onClick={closeSearch}
                    >
                      <div className="flex h-[62px] w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card">
                        {game.coverUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={game.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <span className="text-[10px] font-semibold text-muted">SIN</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-foreground group-hover:text-accent">{game.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                          <span className="rounded-md bg-accent/10 px-1.5 py-0.5 font-bold text-accent">{game.platform}</span>
                          <RegionFlag region={game.region} size="xs" showLabel labelMode="short" />
                          {game.year ? <span>{game.year}</span> : null}
                        </div>
                      </div>
                    </IntentLink>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
