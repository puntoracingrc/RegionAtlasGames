import Link from "next/link";
import { AccountProfileSettings } from "@/components/account-profile-settings";
import { CollectionConditionSettings } from "@/components/collection-condition-settings";
import { SiteNav } from "@/components/site-nav";
import { ThemeSettings } from "@/components/theme-settings";
import { Panel, PanelTitle } from "@/components/ui";
import { aiQuotaRemaining } from "@/lib/ai-listing-analysis";
import { OPEN_ACCESS_AI_ANALYSES_PER_MONTH } from "@/lib/plans";
import { platforms } from "@/lib/catalog";
import { getCurrentUser } from "@/lib/users";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
        <header className="mb-8 space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Ajustes</h1>
          <p className="text-muted">Personaliza la apariencia y tu cuenta.</p>
        </header>

        <div className="space-y-6">
          <Panel>
            <PanelTitle>Apariencia</PanelTitle>
            <p className="mb-4 text-sm text-muted">
              Elige tema claro, oscuro o seguir el sistema.{" "}
              {!user && "Sin cuenta, la preferencia se guarda en este navegador."}
            </p>
            <ThemeSettings initialTheme={user?.theme ?? "system"} />
          </Panel>

          {user && (
            <Panel>
              <PanelTitle>Estado inicial de la colección</PanelTitle>
              <CollectionConditionSettings
                platforms={platforms
                  .map(({ slug, name, manufacturer, sortOrder }) => ({
                    slug,
                    name,
                    manufacturer,
                    sortOrder,
                  }))}
                initialPreferences={user.collectionDefaultConditions}
              />
            </Panel>
          )}

          {user && (
            <Panel>
              <PanelTitle>Funciones disponibles</PanelTitle>
              <p className="mb-4 text-sm text-muted">
                Todas las cuentas tienen acceso al valor de la colección, la compraventa entre
                usuarios y el análisis de fotos.
              </p>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-muted">Valor de colección</dt>
                  <dd className="font-medium text-foreground">Total y por plataforma</dd>
                </div>
                <div>
                  <dt className="text-muted">Mercado entre usuarios</dt>
                  <dd className="font-medium text-foreground">Activo para comprar y vender</dd>
                </div>
                <div>
                  <dt className="text-muted">Análisis de fotos este mes</dt>
                  <dd className="font-medium text-foreground">
                    {await aiQuotaRemaining(user.id, user.plan)} disponibles de{" "}
                    {OPEN_ACCESS_AI_ANALYSES_PER_MONTH}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                <Link href="/mis-anuncios" className="text-accent hover:underline">
                  Mis anuncios →
                </Link>
                <Link href="/mensajes" className="text-accent hover:underline">
                  Mensajes →
                </Link>
              </div>
            </Panel>
          )}

          <Panel>
            <PanelTitle>Cuenta</PanelTitle>
            {user ? (
              <>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-muted">Nombre</dt>
                    <dd className="font-medium text-foreground">{user.name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Email</dt>
                    <dd className="font-medium text-foreground">{user.email}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Ciudad</dt>
                    <dd className="font-medium text-foreground">{user.city ?? "Sin indicar"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Miembro desde</dt>
                    <dd className="font-medium text-foreground">
                      {new Date(user.createdAt).toLocaleDateString("es-ES")}
                    </dd>
                  </div>
                </dl>
                <AccountProfileSettings initialCity={user.city} />
              </>
            ) : (
              <div className="space-y-3 text-sm text-muted">
                <p>Inicia sesión para sincronizar tu colección y preferencias entre dispositivos.</p>
                <Link href="/login?next=%2Fajustes" className="btn-primary">
                  Continuar con Google
                </Link>
              </div>
            )}
          </Panel>
        </div>
      </main>
    </>
  );
}
