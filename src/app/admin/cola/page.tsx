import Link from "next/link";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import { listCatalogStagingGames } from "@/lib/catalog-staging-storage";
import { getPlatform } from "@/lib/catalog";

type Props = {
  searchParams: Promise<{ status?: string; platform?: string }>;
};

export default async function AdminQueuePage({ searchParams }: Props) {
  const params = await searchParams;
  let games = await listCatalogStagingGames();
  games = games.filter((g) => g.status !== "promoted");

  if (params.status === "pending") {
    games = games.filter((g) => g.status === "pending-catalog");
  } else if (params.status === "enriched") {
    games = games.filter((g) => g.status === "enriched");
  }

  if (params.platform) {
    games = games.filter((g) => g.platformSlug === params.platform);
  }

  games.sort(
    (a, b) =>
      b.unitCount - a.unitCount ||
      b.userCount - a.userCount ||
      b.lastSeenAt.localeCompare(a.lastSeenAt),
  );

  return (
    <Panel>
      <PanelTitle>
        Cola de fichas ({games.length})
      </PanelTitle>
      <p className="mb-4 text-sm text-muted">
        Juegos que los usuarios importaron y no están en el catálogo, más entradas manuales. Revisa,
        completa portada y publica.
      </p>

      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <Link
          href="/admin/cola"
          className={`rounded-md px-2 py-1 ${!params.status ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground"}`}
        >
          Todos
        </Link>
        <Link
          href="/admin/cola?status=pending"
          className={`rounded-md px-2 py-1 ${params.status === "pending" ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground"}`}
        >
          Pendientes
        </Link>
        <Link
          href="/admin/cola?status=enriched"
          className={`rounded-md px-2 py-1 ${params.status === "enriched" ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground"}`}
        >
          Enriquecidos
        </Link>
      </div>

      {games.length === 0 ? (
        <p className="text-sm text-muted">No hay juegos en cola con estos filtros.</p>
      ) : (
        <ul className="divide-y divide-border">
          {games.map((game) => {
            const platform = getPlatform(game.platformSlug);
            return (
              <li key={game.pcId} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/cola/${game.pcId}`}
                    className="font-medium text-foreground hover:text-accent"
                  >
                    {game.title}
                  </Link>
                  <p className="text-xs text-muted">
                    {platform?.shortName ?? game.platformSlug} · {game.region}
                    {game.unitCount > 0 && ` · ${game.unitCount} uds · ${game.userCount} usuarios`}
                    {game.pcId < 0 && " · manual"}
                  </p>
                </div>
                <Badge tone={game.status === "enriched" ? "green" : "amber"}>{game.status}</Badge>
                <Link
                  href={`/admin/cola/${game.pcId}`}
                  className="text-xs text-accent hover:underline"
                >
                  Revisar →
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
