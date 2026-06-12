import Link from "next/link";
import { redirect } from "next/navigation";
import { PlanPanel } from "@/components/plan-panel";
import { SiteNav } from "@/components/site-nav";
import { ThemeSettings } from "@/components/theme-settings";
import { Panel, PanelTitle } from "@/components/ui";
import { aiQuotaRemaining } from "@/lib/ai-listing-analysis";
import { getCurrentUser } from "@/lib/users";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-2xl px-4 py-8 md:px-6">
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
              <PanelTitle>Plan y mercado</PanelTitle>
              <p className="mb-4 text-sm text-muted">
                Solo usuarios Pro pueden publicar anuncios, chatear y usar análisis IA de fotos.
              </p>
              <PlanPanel plan={user.plan} aiQuotaRemaining={aiQuotaRemaining(user.id, user.plan)} />
            </Panel>
          )}

          <Panel>
            <PanelTitle>Cuenta</PanelTitle>
            {user ? (
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
                  <dt className="text-muted">Miembro desde</dt>
                  <dd className="font-medium text-foreground">
                    {new Date(user.createdAt).toLocaleDateString("es-ES")}
                  </dd>
                </div>
              </dl>
            ) : (
              <div className="space-y-3 text-sm text-muted">
                <p>Inicia sesión para sincronizar tu colección y preferencias entre dispositivos.</p>
                <div className="flex gap-3">
                  <Link href="/login" className="btn-primary">
                    Iniciar sesión
                  </Link>
                  <Link href="/registro" className="btn-secondary">
                    Registrarse
                  </Link>
                </div>
              </div>
            )}
          </Panel>
        </div>
      </main>
    </>
  );
}
