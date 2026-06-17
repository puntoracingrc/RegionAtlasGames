import Link from "next/link";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import { listCatalogStagingGames } from "@/lib/catalog-staging-storage";
import { getPlatform } from "@/lib/catalog";
import { requireContributorUser } from "@/lib/admin-auth";

export default async function ContribuirHomePage() {
  const user = await requireContributorUser();
  const email = user.email.trim().toLowerCase();

  const games = (await listCatalogStagingGames())
    .filter((g) => g.contributorEmail?.trim().toLowerCase() === email)
    .sort((a, b) => (b.submittedAt ?? b.lastSeenAt).localeCompare(a.submittedAt ?? a.lastSeenAt));
  const drafts = games.filter((g) => g.reviewStatus === "contributor-draft").length;
  const pending = games.filter((g) => g.reviewStatus === "pending-review").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Panel className="md:col-span-2">
          <PanelTitle eyebrow="Tu espacio">Mis fichas ({games.length})</PanelTitle>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-5xl font-black tracking-tight text-foreground">{games.length}</p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                Borradores en curso y envíos pendientes de revisión del administrador.
              </p>
            </div>
            <Link href="/contribuir/nuevo" className="btn-primary w-full sm:w-auto">
              + Nueva ficha
            </Link>
          </div>
        </Panel>
        <Panel>
          <PanelTitle eyebrow="Estado">Resumen</PanelTitle>
          <div className="grid gap-2 text-sm">
            <div className="flex items-center justify-between rounded-xl border border-border bg-background/45 p-3">
              <span className="text-muted">Borradores</span>
              <strong className="text-foreground">{drafts}</strong>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border bg-background/45 p-3">
              <span className="text-muted">En revisión</span>
              <strong className="text-foreground">{pending}</strong>
            </div>
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelTitle eyebrow="Historial">Tus envíos</PanelTitle>
        {games.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-background/45 p-6 text-center">
            <p className="font-semibold text-foreground">Aún no has creado ninguna ficha.</p>
            <p className="mt-1 text-sm text-muted">
              Crea una ficha de prueba o una entrada real y aparecerá aquí.
            </p>
            <Link href="/contribuir/nuevo" className="btn-primary mt-4">
              Crear primera ficha
            </Link>
          </div>
        ) : (
          <ul className="grid gap-3">
            {games.map((game) => {
              const platform = getPlatform(game.platformSlug);
              const reviewLabel =
                game.reviewStatus === "pending-review"
                  ? "pendiente revisión"
                  : game.reviewStatus === "contributor-draft"
                    ? "borrador"
                    : game.reviewStatus ?? "—";

              return (
                <li
                  key={game.pcId}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-background/45 p-4 transition hover:border-accent/40 hover:bg-card-hover md:flex-row md:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/contribuir/${game.pcId}`}
                      className="font-semibold text-foreground hover:text-accent"
                    >
                      {game.title}
                    </Link>
                    <p className="mt-1 text-xs text-muted">
                      {platform?.shortName ?? game.platformSlug} · {game.region}
                    </p>
                  </div>
                  <Badge tone={game.reviewStatus === "pending-review" ? "amber" : "neutral"}>
                    {reviewLabel}
                  </Badge>
                  <Link
                    href={`/contribuir/${game.pcId}`}
                    className="btn-secondary shrink-0 text-xs"
                  >
                    Abrir →
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
