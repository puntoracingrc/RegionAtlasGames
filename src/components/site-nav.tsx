import Link from "next/link";
import { AuthNav } from "@/components/auth-nav";
import { SITE_LOGO } from "@/lib/site-brand";

const LINKS = [
  { href: "/", label: "Inicio" },
  { href: "/plataformas", label: "Plataformas" },
  { href: "/compania", label: "Compañías" },
  { href: "/genero", label: "Géneros" },
  { href: "/coleccion", label: "Mi colección" },
];

export function SiteNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-nav backdrop-blur-md">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-2.5 md:px-6">
        <Link href="/" className="shrink-0 text-sm font-semibold tracking-tight text-accent">
          {SITE_LOGO}
        </Link>

        <div className="flex flex-1 items-center justify-end gap-3 md:gap-5">
          <div className="hidden flex-wrap justify-end gap-x-4 gap-y-1 text-[13px] text-muted sm:flex">
            {LINKS.map((link) => (
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
        </div>
      </div>
    </nav>
  );
}
