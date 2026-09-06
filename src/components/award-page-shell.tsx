import Link from "next/link";
import { SiteNav } from "./site-nav";

export function AwardPageShell({ title, description, breadcrumbs = [], children }: { title: string; description?: string | null; breadcrumbs?: { label: string; href: string }[]; children: React.ReactNode }) {
  return <><SiteNav /><main className="mx-auto max-w-[1280px] px-4 py-8 md:px-6">
    <nav aria-label="Ruta de navegación" className="mb-5 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted"><Link href="/premios" className="hover:text-accent">Premios</Link>{breadcrumbs.map(b => <span key={b.href}>/ <Link href={b.href} className="hover:text-accent">{b.label}</Link></span>)}</nav>
    <header className="border-b border-border pb-6"><h1 className="break-words text-3xl font-black">{title}</h1>{description && <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">{description}</p>}</header>
    {children}
  </main></>;
}
