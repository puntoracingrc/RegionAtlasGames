import { SiteNav } from "@/components/site-nav";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdminUser } from "@/lib/admin-auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminUser();

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <header className="mb-6 space-y-1">
          <h1 className="text-3xl font-bold text-foreground">Admin catálogo</h1>
          <p className="text-sm text-muted">
            Añade fichas, revisa importaciones de usuarios y publica al catálogo maestro.
          </p>
        </header>
        <AdminNav />
        {children}
      </main>
    </>
  );
}
