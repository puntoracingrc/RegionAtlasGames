import Link from "next/link";
import { BackLink } from "@/components/breadcrumbs";
import { genreGameHref, type GenreProfileView } from "@/lib/genre-profile";
import { decodeHtmlEntities } from "@/lib/decode-html-entities";

export function GenreProfileHeader({ view }: { view: GenreProfileView }) {
  return (
    <header className="mt-4 mb-8 space-y-4">
      <BackLink href="/genero">Géneros</BackLink>
      <h1 className="text-4xl font-bold text-foreground">{view.name}</h1>
      <p className="text-foreground/85">
        {view.gameCount.toLocaleString("es-ES")} juegos en el catálogo Region Atlas
      </p>
      {view.alsoKnownAs.length > 0 && (
        <p className="max-w-3xl text-sm text-foreground/75">
          También indexado como {view.alsoKnownAs.slice(0, 5).join(" · ")}
          {view.alsoKnownAs.length > 5 ? " · …" : ""}
        </p>
      )}
    </header>
  );
}

export function GenrePlatformGames({ view }: { view: GenreProfileView }) {
  if (view.platforms.length === 0) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-bold text-foreground">Juegos por plataforma</h2>
        <p className="mt-1 text-sm text-foreground/75">
          Desplegable con enlaces al catálogo Region Atlas.
        </p>
      </div>
      <div className="space-y-2">
        {view.platforms.map((platform) => (
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
                  <Link
                    href={genreGameHref(game)}
                    className="block rounded-lg px-2 py-1.5 text-sm text-foreground/90 hover:bg-black/20 hover:text-accent"
                  >
                    {decodeHtmlEntities(game.title)}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}
