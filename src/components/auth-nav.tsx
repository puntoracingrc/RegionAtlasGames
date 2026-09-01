"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NotificationBell } from "@/components/notification-bell";
import type { PublicUser } from "@/lib/session";

export function AuthNav({ initialUser }: { initialUser?: PublicUser | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const nextPath = pathname === "/login" || pathname === "/registro"
    ? "/coleccion"
    : pathname || "/coleccion";
  const [user, setUser] = useState<PublicUser | null>(initialUser ?? null);
  const [loading, setLoading] = useState(initialUser === undefined);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (initialUser !== undefined) return;
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setUser(data.user ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialUser]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setOpen(false);
    router.refresh();
  }

  if (loading) {
    return <div className="h-8 w-20 animate-pulse rounded-md bg-card" />;
  }

  if (!user) {
    return (
      <div className="flex items-center gap-1.5 sm:gap-2">
        <Link
          href="/ajustes"
          className="hidden rounded-md px-2 py-1.5 text-[13px] text-muted transition hover:text-foreground sm:inline"
          title="Ajustes"
        >
          Ajustes
        </Link>
        <Link
          href={`/login?next=${encodeURIComponent(nextPath)}`}
          className="rounded-md bg-accent px-2 py-1.5 text-[12px] font-medium text-accent-fg transition hover:opacity-90 sm:px-2.5 sm:text-[13px]"
        >
          <span className="sm:hidden">Entrar</span>
          <span className="hidden sm:inline">Continuar con Google</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/mensajes"
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2 text-foreground transition hover:bg-card-hover xl:px-2.5"
        title="Marketplace y mensajes"
        aria-label="Marketplace y mensajes"
      >
        <MessageCircle className="h-4 w-4" aria-hidden />
        <span className="hidden text-[13px] xl:inline">Mensajes</span>
      </Link>
      <NotificationBell />
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-[13px] transition hover:bg-card-hover"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent">
            {user.name.charAt(0).toUpperCase()}
          </span>
          <span className="hidden max-w-[120px] truncate text-foreground sm:inline">{user.name}</span>
        </button>
        {open && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40"
              aria-label="Cerrar menú"
              onClick={() => setOpen(false)}
            />
            <div className="absolute right-0 z-50 mt-2 min-w-[180px] rounded-lg border border-border bg-card py-1 shadow-lg shadow-black/20">
              <p className="border-b border-border px-3 py-2 text-xs text-muted">{user.email}</p>
              <Link
                href="/ajustes"
                className="block px-3 py-2 text-sm text-foreground hover:bg-card-hover"
                onClick={() => setOpen(false)}
              >
                Ajustes
              </Link>
              <Link
                href="/coleccion"
                className="block px-3 py-2 text-sm text-foreground hover:bg-card-hover"
                onClick={() => setOpen(false)}
              >
                Mi colección
              </Link>
              <Link
                href="/mis-anuncios"
                className="block px-3 py-2 text-sm text-foreground hover:bg-card-hover"
                onClick={() => setOpen(false)}
              >
                Mis anuncios
              </Link>
              <Link
                href="/notificaciones"
                className="block px-3 py-2 text-sm text-foreground hover:bg-card-hover"
                onClick={() => setOpen(false)}
              >
                Notificaciones
              </Link>
              <Link
                href="/mensajes"
                className="block px-3 py-2 text-sm text-foreground hover:bg-card-hover"
                onClick={() => setOpen(false)}
              >
                Mensajes
              </Link>
              <button
                type="button"
                onClick={logout}
                className="block w-full px-3 py-2 text-left text-sm text-rose-500 hover:bg-card-hover"
              >
                Cerrar sesión
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
