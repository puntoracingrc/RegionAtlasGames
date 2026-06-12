import Link from "next/link";
import { notFound } from "next/navigation";
import { EntityBrowser } from "@/components/catalog-browser";
import { SiteNav } from "@/components/site-nav";
import { getOwnedCatalogIds } from "@/lib/collection-store";
import {
  gamesForIndex,
  getCompany,
  platformBreakdown,
} from "@/lib/indexes";
import { getCurrentUser } from "@/lib/users";

type Props = { params: Promise<{ slug: string }> };

export default async function CompanyPage({ params }: Props) {
  const { slug } = await params;
  const company = getCompany(slug);
  if (!company) notFound();

  const games = gamesForIndex(company);
  const platforms = platformBreakdown(company);
  const user = await getCurrentUser();
  const ownedCatalogIds = user ? getOwnedCatalogIds(user.id) : [];

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <Link href="/compania" className="text-sm text-muted hover:text-accent">
          ← Compañías
        </Link>

        <header className="mt-4 mb-8 space-y-4">
          <h1 className="text-4xl font-bold text-foreground">{company.name}</h1>
          <p className="text-muted">
            {company.gameCount} juegos en el catálogo
            {company.asDeveloper && company.asPublisher && (
              <>
                {" "}
                · {company.asDeveloper.length} como desarrolladora ·{" "}
                {company.asPublisher.length} como publicadora
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {platforms.map((p) => (
              <span
                key={p.slug}
                className="rounded-full bg-white/10 px-3 py-1 text-xs text-foreground/80"
              >
                {p.name}: {p.count}
              </span>
            ))}
          </div>
        </header>

        <EntityBrowser games={games} title={company.name} ownedCatalogIds={ownedCatalogIds} isLoggedIn={!!user} />
      </main>
    </>
  );
}
