import { CatalogGameListLink } from "@/components/catalog-game-list-link";
import { companyGameHref, type CompanyPlatformGames } from "@/lib/company-profile";

export function CompanyPlatformGames({ platforms }: { platforms: CompanyPlatformGames[] }) {
  if (platforms.length === 0) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-bold text-foreground">Juegos por plataforma</h2>
        <p className="mt-1 text-sm text-foreground/75">
          Desplegable con enlaces a las fichas del catálogo Region Atlas.
        </p>
      </div>
      <div className="space-y-2">
        {platforms.map((platform) => (
          <details
            key={platform.platformSlug}
            className="group rounded-2xl border border-border bg-card open:bg-card-hover"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none">
              <span className="font-medium text-foreground">
                {platform.platformName}
                <span className="ml-2 text-sm font-normal text-foreground/70">
                  ({platform.count.toLocaleString("es-ES")})
                </span>
              </span>
              <span className="text-xs text-muted transition group-open:rotate-180">▼</span>
            </summary>
            <ul className="max-h-80 space-y-1 overflow-y-auto border-t border-border/70 px-4 py-3">
              {platform.games.map((game) => (
                <li key={game.id}>
                  <CatalogGameListLink game={game} href={companyGameHref(game)} />
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}
