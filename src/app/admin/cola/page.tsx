import Link from "next/link";
import { adminToneClass } from "@/components/admin/admin-visual";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import { listCatalogStagingGames } from "@/lib/catalog-staging-storage";
import { getPlatform, platforms } from "@/lib/catalog";
import type { CatalogStagingGame } from "@/lib/catalog-staging-types";

type Props = {
  searchParams: Promise<{ status?: string; platform?: string; review?: string; source?: string }>;
};

type ReviewSource = "contributors" | "users" | "imports";

function reviewSource(game: CatalogStagingGame): ReviewSource {
  if (game.contributorEmail && game.reviewStatus === "pending-review") return "contributors";
  if (game.userCount > 0 || game.unitCount > 0 || game.userIds.length > 0) return "users";
  return "imports";
}

function sourceLabel(source: ReviewSource): string {
  if (source === "contributors") return "Colaborador";
  if (source === "users") return "Usuario";
  return "Importada sin solicitud";
}

function sourceTone(source: ReviewSource): "amber" | "violet" | "neutral" {
  if (source === "contributors") return "amber";
  if (source === "users") return "violet";
  return "neutral";
}

function buildQueueHref(input: {
  source?: ReviewSource;
  status?: string;
  platform?: string;
}): string {
  const params = new URLSearchParams();
  if (input.source) params.set("source", input.source);
  if (input.status) params.set("status", input.status);
  if (input.platform) params.set("platform", input.platform);
  const query = params.toString();
  return query ? `/admin/cola?${query}` : "/admin/cola";
}

function filterHref(source?: ReviewSource, status?: string, platform?: string): string {
  return buildQueueHref({ source, status, platform });
}

function activeSource(params: { source?: string; review?: string }): ReviewSource | undefined {
  if (params.source === "contributors" || params.review === "contributor") return "contributors";
  if (params.source === "users") return "users";
  if (params.source === "imports") return "imports";
  return undefined;
}

export default async function AdminQueuePage({ searchParams }: Props) {
  const params = await searchParams;
  const currentSource = activeSource(params);
  const currentPlatform = typeof params.platform === "string" ? params.platform : undefined;
  const allPendingGames = (await listCatalogStagingGames()).filter((g) => g.status !== "promoted");
  let games = allPendingGames;
  const sourceCounts = games.reduce(
    (counts, game) => {
      counts[reviewSource(game)] += 1;
      return counts;
    },
    { contributors: 0, users: 0, imports: 0 } satisfies Record<ReviewSource, number>,
  );

  if (currentSource) {
    games = games.filter((g) => reviewSource(g) === currentSource);
  }

  if (params.status === "pending") {
    games = games.filter((g) => g.status === "pending-catalog");
  } else if (params.status === "enriched") {
    games = games.filter((g) => g.status === "enriched");
  }

  const gamesBeforePlatformFilter = games;
  const platformStatsBySlug = gamesBeforePlatformFilter.reduce(
    (stats, game) => {
      const current = stats.get(game.platformSlug) ?? { games: 0, units: 0 };
      current.games += 1;
      current.units += Math.max(1, game.unitCount || 0);
      stats.set(game.platformSlug, current);
      return stats;
    },
    new Map<string, { games: number; units: number }>(),
  );
  const knownPlatformSlugs = new Set(platforms.map((platform) => platform.slug));
  const platformFilterOptions = [
    ...platforms
      .filter((platform) => platformStatsBySlug.has(platform.slug))
      .map((platform) => ({
        slug: platform.slug,
        name: platform.shortName || platform.name,
        sortOrder: platform.sortOrder ?? 9999,
        stats: platformStatsBySlug.get(platform.slug)!,
      })),
    ...[...platformStatsBySlug.entries()]
      .filter(([slug]) => !knownPlatformSlugs.has(slug))
      .map(([slug, stats]) => ({
        slug,
        name: slug.toUpperCase(),
        sortOrder: 99999,
        stats,
      })),
  ].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es"));

  if (currentPlatform) {
    games = games.filter((g) => g.platformSlug === currentPlatform);
  }

  games.sort(
    (a, b) =>
      b.unitCount - a.unitCount ||
      b.userCount - a.userCount ||
      b.lastSeenAt.localeCompare(a.lastSeenAt),
  );

  return (
    <Panel className={adminToneClass("search")}>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <PanelTitle eyebrow="Trabajo pendiente">Revisión de fichas ({games.length})</PanelTitle>
          <p className="max-w-3xl text-sm leading-6 text-muted">
            Importaciones de usuarios, entradas manuales y envíos de colaboradores. Completa portada,
            revisa datos y publica cuando esté listo.
          </p>
        </div>
        <Link href="/admin/juegos/nuevo" className="btn-primary w-full md:w-auto">
          + Añadir manual
        </Link>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <Link
          href={filterHref("contributors", undefined, currentPlatform)}
          className={`rounded-2xl border p-4 transition hover:bg-card-hover ${currentSource === "contributors" ? "border-accent bg-accent/10" : "border-border bg-background/45"}`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Enviados por colaboradores</p>
          <p className="mt-2 text-2xl font-black text-foreground">{sourceCounts.contributors}</p>
          <p className="mt-1 text-xs text-muted">Fichas creadas y enviadas para aprobación.</p>
        </Link>
        <Link
          href={filterHref("users", undefined, currentPlatform)}
          className={`rounded-2xl border p-4 transition hover:bg-card-hover ${params.source === "users" ? "border-accent bg-accent/10" : "border-border bg-background/45"}`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Solicitados por usuarios</p>
          <p className="mt-2 text-2xl font-black text-foreground">{sourceCounts.users}</p>
          <p className="mt-1 text-xs text-muted">Aparecen porque alguien los tiene/importó en su colección.</p>
        </Link>
        <Link
          href={filterHref("imports", undefined, currentPlatform)}
          className={`rounded-2xl border p-4 transition hover:bg-card-hover ${params.source === "imports" ? "border-accent bg-accent/10" : "border-border bg-background/45"}`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Importadas sin solicitud</p>
          <p className="mt-2 text-2xl font-black text-foreground">{sourceCounts.imports}</p>
          <p className="mt-1 text-xs text-muted">Entraron por importación/manual, pero nadie las ha pedido.</p>
        </Link>
      </div>

      <div className="my-5 flex flex-wrap gap-2 text-xs">
        <Link
          href={buildQueueHref({ platform: currentPlatform })}
          className={`rounded-full border px-3 py-1.5 font-semibold ${!params.status && !currentSource ? "border-accent bg-accent text-accent-fg" : "border-border text-muted hover:bg-card-hover hover:text-foreground"}`}
        >
          Todos
        </Link>
        <Link
          href={filterHref("contributors", params.status, currentPlatform)}
          className={`rounded-full border px-3 py-1.5 font-semibold ${currentSource === "contributors" ? "border-accent bg-accent text-accent-fg" : "border-border text-muted hover:bg-card-hover hover:text-foreground"}`}
        >
          Colaboradores
        </Link>
        <Link
          href={filterHref("users", params.status, currentPlatform)}
          className={`rounded-full border px-3 py-1.5 font-semibold ${params.source === "users" ? "border-accent bg-accent text-accent-fg" : "border-border text-muted hover:bg-card-hover hover:text-foreground"}`}
        >
          Usuarios
        </Link>
        <Link
          href={filterHref("imports", params.status, currentPlatform)}
          className={`rounded-full border px-3 py-1.5 font-semibold ${params.source === "imports" ? "border-accent bg-accent text-accent-fg" : "border-border text-muted hover:bg-card-hover hover:text-foreground"}`}
        >
          Sin solicitud
        </Link>
        <Link
          href={filterHref(currentSource, "pending", currentPlatform)}
          className={`rounded-full border px-3 py-1.5 font-semibold ${params.status === "pending" ? "border-accent bg-accent text-accent-fg" : "border-border text-muted hover:bg-card-hover hover:text-foreground"}`}
        >
          Pendientes
        </Link>
        <Link
          href={filterHref(currentSource, "enriched", currentPlatform)}
          className={`rounded-full border px-3 py-1.5 font-semibold ${params.status === "enriched" ? "border-accent bg-accent text-accent-fg" : "border-border text-muted hover:bg-card-hover hover:text-foreground"}`}
        >
          Enriquecidos
        </Link>
      </div>

      {platformFilterOptions.length > 0 ? (
        <div className="mb-5 rounded-2xl border border-sky-300/40 bg-background/45 p-3 dark:border-sky-400/20">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              Filtrar por plataforma
            </p>
            {currentPlatform ? (
              <Link
                href={buildQueueHref({ source: currentSource, status: params.status })}
                className="text-xs font-semibold text-accent hover:underline"
              >
                Quitar filtro de plataforma
              </Link>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Link
              href={buildQueueHref({ source: currentSource, status: params.status })}
              className={`rounded-full border px-3 py-1.5 font-semibold ${
                !currentPlatform
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-border text-muted hover:bg-card-hover hover:text-foreground"
              }`}
            >
              Todas · {gamesBeforePlatformFilter.length}
            </Link>
            {platformFilterOptions.map((platform) => {
              const unitsLabel =
                platform.stats.units !== platform.stats.games ? ` · ${platform.stats.units} uds` : "";
              return (
                <Link
                  key={platform.slug}
                  href={buildQueueHref({
                    source: currentSource,
                    status: params.status,
                    platform: platform.slug,
                  })}
                  className={`rounded-full border px-3 py-1.5 font-semibold ${
                    currentPlatform === platform.slug
                      ? "border-accent bg-accent text-accent-fg"
                      : "border-border text-muted hover:bg-card-hover hover:text-foreground"
                  }`}
                >
                  {platform.name} · {platform.stats.games}
                  {unitsLabel}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      {games.length === 0 ? (
        <p className="text-sm text-muted">No hay juegos en revisión con estos filtros.</p>
      ) : (
        <ul className="grid gap-3">
          {games.map((game) => {
            const platform = getPlatform(game.platformSlug);
            const source = reviewSource(game);
            return (
              <li
                key={game.pcId}
                className="rounded-2xl border border-border bg-background/45 p-4 transition hover:border-accent/40 hover:bg-card-hover"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/cola/${game.pcId}`}
                    className="text-base font-semibold text-foreground hover:text-accent"
                  >
                    {game.title}
                  </Link>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    {platform?.shortName ?? game.platformSlug} · {game.region}
                    {game.unitCount > 0 && ` · ${game.unitCount} uds · ${game.userCount} usuarios`}
                    {game.pcId < 0 && !game.contributorEmail && " · manual"}
                    {game.contributorEmail && ` · colaborador: ${game.contributorEmail}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={sourceTone(source)}>{sourceLabel(source)}</Badge>
                  {game.reviewStatus === "pending-review" && game.contributorEmail ? (
                    <Badge tone="amber">pendiente aprobación</Badge>
                  ) : (
                    <Badge tone={game.status === "enriched" ? "green" : "amber"}>{game.status}</Badge>
                  )}
                </div>
                <Link
                  href={`/admin/cola/${game.pcId}`}
                  className="btn-secondary shrink-0 text-xs"
                >
                  Abrir ficha →
                </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
