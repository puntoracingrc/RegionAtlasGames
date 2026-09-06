import { cache, Suspense } from "react";
import {
  ArrowRight,
  Boxes,
  CircleAlert,
  CircleDollarSign,
  Gamepad2,
  MessageCircle,
  PackageCheck,
} from "lucide-react";
import Link from "next/link";
import { CollectionValueChart } from "@/components/collection-value-chart";
import { HomeSearch } from "@/components/home-search";
import { NewsStrip } from "@/components/news-strip";
import { SiteNav } from "@/components/site-nav";
import { Panel } from "@/components/ui";
import { listAdminPlatforms } from "@/lib/admin-entity-catalog";
import {
  enrichCollectionItem,
  getCatalogGame,
  meta,
  publicListedCatalog,
} from "@/lib/catalog";
import { catalogGamePath } from "@/lib/catalog-seo";
import { readUserCollection, summarizeCollectionForPlan } from "@/lib/collection-store";
import { getUserCommunicationOverview } from "@/lib/conversations";
import { getCoverSrc } from "@/lib/cover-url";
import { buildHomeCollectionSnapshot, type HomeCollectionSnapshot } from "@/lib/home-dashboard";
import { indexStats } from "@/lib/indexes";
import { getSellerListings } from "@/lib/listings";
import { listingStatusLabel } from "@/lib/marketplace-ui";
import { listNewsForSection } from "@/lib/news-cache";
import { formatEur } from "@/lib/price-format";
import type { PublicUser } from "@/lib/session";
import { SITE_LOGO } from "@/lib/site-brand";
import type { CatalogGame, CollectionView } from "@/lib/types";
import { getCurrentUser } from "@/lib/users";

const loadHomeCollectionSnapshot = cache(
  async (userId: string, plan: PublicUser["plan"]): Promise<HomeCollectionSnapshot> => {
    const file = await readUserCollection(userId);
    const items = file.items.map(enrichCollectionItem);
    const summary = summarizeCollectionForPlan(items, plan);
    return buildHomeCollectionSnapshot(items, summary);
  },
);

const loadHomeActivity = cache(async (userId: string) => {
  const [communication, listings] = await Promise.all([
    getUserCommunicationOverview(userId, 5),
    getSellerListings(userId),
  ]);
  return { communication, listings };
});

const PUBLIC_CATALOG_SAMPLE = [...publicListedCatalog]
  .filter((game) => game.coverUrl && game.recommendedPrice != null)
  .sort(
    (a, b) =>
      (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") ||
      a.title.localeCompare(b.title, "es"),
  )
  .slice(0, 6);

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <>
      <SiteNav initialUser={user} />
      {user ? <PersonalHome user={user} /> : <PublicHome />}
    </>
  );
}

async function PersonalHome({ user }: { user: PublicUser }) {
  const activityPromise = loadHomeActivity(user.id);
  const snapshot = await loadHomeCollectionSnapshot(user.id, user.plan);
  const { summary } = snapshot;
  const attentionCount = summary.pendingCatalog + summary.outOfScopeItems;

  return (
    <main className="mx-auto max-w-[1500px] px-4 py-6 md:px-6 md:py-8">
      <header className="mb-7 flex flex-col justify-between gap-4 border-b border-border/70 pb-6 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">Tu inicio</p>
          <h1 className="mt-1 text-3xl font-bold text-foreground md:text-4xl">
            Hola, {firstName(user.name)}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted md:text-base">
            Este es el estado actual de tu colección y tu actividad en {SITE_LOGO}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/coleccion" className="btn-primary gap-2">
            <Boxes className="h-4 w-4" aria-hidden />
            Gestionar colección
          </Link>
          <Link href="/plataformas" className="btn-secondary gap-2">
            Explorar catálogo
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </header>

      <HomeSearch />

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen de colección">
        <DashboardMetric
          icon={Gamepad2}
          label="Juegos"
          value={summary.totalItems.toLocaleString("es-ES")}
          detail={`${summary.totalUnits.toLocaleString("es-ES")} unidades`}
        />
        <DashboardMetric
          icon={CircleDollarSign}
          label="Valor estimado"
          value={formatEur(summary.totalRecommendedValue)}
          detail={`${snapshot.priceCoveragePct}% de fichas con precio`}
        />
        <DashboardMetric
          icon={PackageCheck}
          label="Con precio"
          value={summary.withEsPrice.toLocaleString("es-ES")}
          detail={`${summary.pendingEsPrice.toLocaleString("es-ES")} pendientes`}
        />
        <DashboardMetric
          icon={CircleAlert}
          label="Fichas pendientes"
          value={attentionCount.toLocaleString("es-ES")}
          detail={`${summary.pendingEsPrice.toLocaleString("es-ES")} sin precio`}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.65fr)]">
        <Panel className="min-w-0">
          <SectionHeading
            title="Evolución del valor"
            detail="Historial disponible y valor actual de tus unidades."
          />
          <CollectionValueChart points={snapshot.valueHistory} />
        </Panel>

        <Panel>
          <SectionHeading title="Plataformas favoritas" detail="Ordenadas por unidades en tu colección." />
          {snapshot.favoritePlatforms.length > 0 ? (
            <ul className="divide-y divide-border/70">
              {snapshot.favoritePlatforms.map((platform) => (
                <li key={platform.slug}>
                  <Link
                    href={`/plataforma/${platform.slug}`}
                    className="group block py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-semibold text-foreground group-hover:text-accent">
                        {platform.label}
                      </span>
                      <span className="text-muted">{platform.units} uds.</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${Math.max(platform.share, 3)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-muted">
                      {platform.games} {platform.games === 1 ? "juego" : "juegos"} · {platform.share}%
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyLine href="/coleccion" label="Añade juegos para ver tus plataformas principales." />
          )}
        </Panel>

        <Panel>
          <SectionHeading
            title="Últimos añadidos"
            detail="Los movimientos más recientes de tu colección."
            href="/coleccion"
            action="Ver colección"
          />
          {snapshot.recentItems.length > 0 ? (
            <div className="grid gap-x-5 sm:grid-cols-2">
              {snapshot.recentItems.map((item) => (
                <RecentCollectionRow key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <EmptyLine href="/coleccion" label="Tu colección todavía está vacía." />
          )}
        </Panel>

        <div className="space-y-6">
          <Panel>
            <SectionHeading title="Fichas por completar" detail="Trabajo pendiente para mejorar tu resumen." />
            <div className="space-y-3 text-sm">
              <StatusLine label="Sin enlazar al catálogo" value={summary.pendingCatalog} />
              <StatusLine label="Fuera del catálogo actual" value={summary.outOfScopeItems} />
              <StatusLine label="Sin precio español" value={summary.pendingEsPrice} />
            </div>
            <Link href="/coleccion" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
              Revisar pendientes <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Panel>

          <Suspense fallback={<ActivitySkeleton />}>
            <HomeActivityPanel userId={user.id} activityPromise={activityPromise} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

async function HomeActivityPanel({
  userId,
  activityPromise,
}: {
  userId: string;
  activityPromise: ReturnType<typeof loadHomeActivity>;
}) {
  const { communication, listings } = await activityPromise;
  const openListings = listings.filter((listing) => listing.status === "active" || listing.status === "draft");
  const events = [
    ...communication.notifications.map((notification) => ({
      key: `notification-${notification.id}`,
      title: notification.title,
      detail: notification.body,
      href: notification.href,
      at: notification.createdAt,
      unread: !notification.readAt,
    })),
    ...communication.conversations.map(({ conversation, unreadCount }) => {
      const latest = conversation.messages.at(-1);
      const peer = conversation.buyerId === userId ? conversation.sellerName : conversation.buyerName;
      return {
        key: `conversation-${conversation.id}`,
        title: getCatalogGame(conversation.catalogId)?.title ?? "Conversación de compraventa",
        detail: latest?.body ? `${peer}: ${latest.body}` : `Conversación con ${peer}`,
        href: `/chat/${conversation.id}`,
        at: latest?.createdAt ?? conversation.updatedAt,
        unread: unreadCount > 0,
      };
    }),
    ...listings.map((listing) => ({
      key: `listing-${listing.id}`,
      title: listing.title,
      detail: `Anuncio ${listingStatusLabel(listing.status).toLowerCase()}`,
      href: `/venta/${listing.id}`,
      at: listing.updatedAt,
      unread: false,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5);

  return (
    <Panel>
      <SectionHeading
        title="Actividad"
        detail={`${communication.summary.unreadMessages} mensajes sin leer · ${openListings.length} anuncios abiertos`}
        href="/notificaciones"
        action="Ver todo"
      />
      {events.length > 0 ? (
        <ul className="divide-y divide-border/70">
          {events.map((event) => (
            <li key={event.key}>
              <Link href={event.href} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${event.unread ? "bg-accent" : "bg-foreground/20"}`} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground hover:text-accent">
                    {event.title}
                  </span>
                  {event.detail && <span className="mt-0.5 block truncate text-xs text-muted">{event.detail}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyLine href="/mensajes" label="No hay actividad de compraventa todavía." />
      )}
      <div className="mt-4 flex gap-2 border-t border-border/70 pt-4">
        <Link href="/mensajes" className="btn-secondary flex-1 gap-1.5 text-xs">
          <MessageCircle className="h-4 w-4" aria-hidden /> Mensajes
        </Link>
        <Link href="/mis-anuncios" className="btn-secondary flex-1 text-xs">Mis anuncios</Link>
      </div>
    </Panel>
  );
}

async function PublicHome() {
  const [platforms, homeNews] = await Promise.all([
    listAdminPlatforms().then((items) => items.filter((platform) => platform.active !== false)),
    listNewsForSection({ section: "home", topic: "general", limit: 6 }),
  ]);
  const indexes = indexStats();
  return (
    <main className="mx-auto max-w-[1500px] px-4 py-7 md:px-6 md:py-10">
      <header className="mb-8 grid gap-6 border-b border-border/70 pb-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">Catálogo físico por región</p>
          <h1 className="mt-2 text-4xl font-bold text-foreground md:text-6xl">{SITE_LOGO}</h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted md:text-lg">
            Explora ediciones por consola y región, consulta precios del mercado español y organiza tu colección.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/login" className="btn-primary">Continuar con Google</Link>
        </div>
      </header>

      <HomeSearch />

      <section className="my-8 grid grid-cols-2 border-y border-border/70 md:grid-cols-4" aria-label="Cobertura del catálogo">
        <PublicStat value={publicListedCatalog.length.toLocaleString("es-ES")} label="Fichas catalogadas" />
        <PublicStat value={String(platforms.length)} label="Plataformas" />
        <PublicStat value={indexes.companies.toLocaleString("es-ES")} label="Compañías" />
        <PublicStat value={(meta.gamesWithDetails ?? 0).toLocaleString("es-ES")} label="Fichas completas" />
      </section>

      <section className="mb-9">
        <SectionHeading
          title="Fichas actualizadas"
          detail="Una muestra reciente del catálogo público."
          href="/plataformas"
          action="Ver plataformas"
        />
        <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
          {PUBLIC_CATALOG_SAMPLE.map((game) => (
            <PublicCatalogRow key={game.id} game={game} />
          ))}
        </div>
      </section>

      <NewsStrip title="Actividad reciente" items={homeNews} />
    </main>
  );
}

function DashboardMetric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Gamepad2;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-lg border border-border/80 bg-card/90 p-4 shadow-sm shadow-black/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
          <p className="mt-1 text-xs text-muted">{detail}</p>
        </div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-accent/10 text-accent">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
    </article>
  );
}

function SectionHeading({
  title,
  detail,
  href,
  action,
}: {
  title: string;
  detail?: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        {detail && <p className="mt-1 text-xs text-muted">{detail}</p>}
      </div>
      {href && action && (
        <Link href={href} className="shrink-0 text-xs font-medium text-accent hover:underline">
          {action}
        </Link>
      )}
    </div>
  );
}

function RecentCollectionRow({ item }: { item: CollectionView }) {
  const cover = getCoverSrc(item.coverUrl, item.catalogId ?? item.id);
  const catalogGame = item.catalogId ? getCatalogGame(item.catalogId) : null;
  const href = catalogGame && item.catalogMatched ? catalogGamePath(catalogGame) : `/coleccion/${item.id}`;

  return (
    <Link href={href} className="group grid min-h-20 grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 py-3">
      <div className="flex h-16 w-12 items-center justify-center overflow-hidden rounded border border-border bg-background">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
        ) : (
          <span className="px-1 text-center text-[8px] uppercase text-muted">Sin portada</span>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground group-hover:text-accent">{item.title}</p>
        <p className="mt-1 text-xs uppercase text-muted">{item.platformSlug} · {item.region}</p>
        <p className="mt-1 text-[11px] text-muted">{formatAddedAt(item.addedAt)}</p>
      </div>
      <span className="text-sm font-semibold text-foreground">{item.quantity > 1 ? `×${item.quantity}` : ""}</span>
    </Link>
  );
}

function PublicCatalogRow({ game }: { game: CatalogGame }) {
  const cover = getCoverSrc(game.coverUrl, game.id);
  return (
    <Link href={catalogGamePath(game)} className="group grid min-h-24 grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 py-3">
      <div className="flex h-20 w-14 items-center justify-center overflow-hidden rounded border border-border bg-card">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
        ) : (
          <span className="px-1 text-center text-[8px] uppercase text-muted">Sin portada</span>
        )}
      </div>
      <div className="min-w-0">
        <p className="line-clamp-2 text-sm font-semibold text-foreground group-hover:text-accent">{game.title}</p>
        <p className="mt-1 text-xs text-muted">{game.platformSlug.toUpperCase()} · {game.region}</p>
      </div>
      <span className="text-sm font-bold text-foreground">
        {game.recommendedPrice != null ? formatEur(game.recommendedPrice) : ""}
      </span>
    </Link>
  );
}

function PublicStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-r border-border/70 px-3 py-4 text-center even:border-r-0 md:py-5 md:even:border-r md:last:border-r-0">
      <p className="text-xl font-bold text-foreground md:text-2xl">{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}

function StatusLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/70 pb-2 last:border-b-0 last:pb-0">
      <span className="text-muted">{label}</span>
      <strong className="text-foreground">{value.toLocaleString("es-ES")}</strong>
    </div>
  );
}

function EmptyLine({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="block border-y border-dashed border-border py-8 text-center text-sm text-muted hover:text-accent">
      {label}
    </Link>
  );
}

function ActivitySkeleton() {
  return (
    <Panel>
      <div className="h-5 w-28 animate-pulse rounded bg-foreground/10" />
      <div className="mt-5 space-y-3">
        {[0, 1, 2].map((value) => (
          <div key={value} className="h-10 animate-pulse rounded bg-foreground/5" />
        ))}
      </div>
    </Panel>
  );
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "coleccionista";
}

function formatAddedAt(value: string | null | undefined): string {
  if (!value) return "En tu colección";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "En tu colección";
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
}
