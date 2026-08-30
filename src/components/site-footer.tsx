import Link from "next/link";

const legalLinks = [
  { href: "/aviso-legal", label: "Aviso legal" },
  { href: "/privacidad", label: "Privacidad" },
  { href: "/cookies", label: "Cookies" },
  { href: "/terminos", label: "Términos" },
  { href: "/affiliate-disclosure", label: "Afiliación" },
];

export function SiteFooter() {
  return (
    <footer className="relative z-0 mt-12 shrink-0 border-t border-border bg-card/55">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-8 text-sm text-muted md:flex-row md:items-center md:justify-between md:px-6">
        <div>
          <p className="font-semibold text-foreground">Region Atlas Games</p>
          <p className="mt-1 max-w-2xl">
            Catálogo, precios orientativos y herramientas para coleccionistas. La información puede cambiar y debe revisarse siempre en la fuente final.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Enlaces legales">
          {legalLinks.map((link) => (
            <Link key={link.href} href={link.href} className="transition hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
