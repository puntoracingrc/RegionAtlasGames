"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PublicUser } from "@/lib/session";

export function AuthNav() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setUser(data.user ?? null))
      .finally(() => setLoading(false));
  }, []);

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
      <div className="flex items-center gap-2">
        <Link
          href="/ajustes"
          className="rounded-md px-2 py-1.5 text-[13px] text-muted transition hover:text-foreground"
          title="Ajustes"
        >
          Ajustes
        </Link>
        <Link
          href="/login"
          className="rounded-md px-2.5 py-1.5 text-[13px] text-muted transition hover:text-foreground"
        >
          Iniciar sesión
        </Link>
        <Link
          href="/registro"
          className="rounded-md bg-accent px-2.5 py-1.5 text-[13px] font-medium text-accent-fg transition hover:opacity-90"
        >
          Registrarse
        </Link>
      </div>
    );
  }

  return (
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
            {user.plan === "pro" && (
              <>
                <Link
                  href="/mis-anuncios"
                  className="block px-3 py-2 text-sm text-foreground hover:bg-card-hover"
                  onClick={() => setOpen(false)}
                >
                  Mis anuncios
                  <span className="ml-1.5 rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                    Pro
                  </span>
                </Link>
                <Link
                  href="/mensajes"
                  className="block px-3 py-2 text-sm text-foreground hover:bg-card-hover"
                  onClick={() => setOpen(false)}
                >
                  Mensajes
                </Link>
              </>
            )}
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
  );
}
