"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SiteNav } from "@/components/site-nav";
import { Panel, PanelTitle } from "@/components/ui";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"password" | "magic">("password");

  useEffect(() => {
    const magic = searchParams.get("magic");
    if (!magic) return;
    if (magic === "invalid") setError("Enlace de acceso no válido.");
    else if (magic === "login-failed") setError("No se pudo iniciar sesión con el enlace.");
    else setError(decodeURIComponent(magic));
  }, [searchParams]);

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    setDevLink(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Error al iniciar sesión.");
      return;
    }
    router.push("/coleccion");
    router.refresh();
  }

  async function onMagicSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    setDevLink(null);
    const res = await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo enviar el enlace.");
      return;
    }
    setInfo(data.message ?? "Revisa tu email.");
    if (data.verifyUrl) setDevLink(data.verifyUrl);
  }

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-md px-4 py-10 md:px-6">
        <Panel>
          <PanelTitle>Iniciar sesión</PanelTitle>
          <p className="mb-4 text-sm text-muted">
            Accede para guardar juegos en tu colección y usar el mercado Pro.
          </p>

          <div className="mb-4 flex rounded-lg border border-border p-0.5">
            <button
              type="button"
              onClick={() => setMode("password")}
              className={`flex-1 rounded-md px-3 py-2 text-sm ${mode === "password" ? "bg-accent/15 text-accent" : "text-muted"}`}
            >
              Contraseña
            </button>
            <button
              type="button"
              onClick={() => setMode("magic")}
              className={`flex-1 rounded-md px-3 py-2 text-sm ${mode === "magic" ? "bg-accent/15 text-accent" : "text-muted"}`}
            >
              Enlace mágico
            </button>
          </div>

          {mode === "password" ? (
            <form onSubmit={onPasswordSubmit} className="space-y-4">
              <Field label="Email">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  autoComplete="email"
                />
              </Field>
              <Field label="Contraseña">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  autoComplete="current-password"
                />
              </Field>
              {error && <p className="text-sm text-rose-500">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "Entrando…" : "Entrar"}
              </button>
            </form>
          ) : (
            <form onSubmit={onMagicSubmit} className="space-y-4">
              <Field label="Email">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  autoComplete="email"
                />
              </Field>
              {error && <p className="text-sm text-rose-500">{error}</p>}
              {info && <p className="text-sm text-emerald-400">{info}</p>}
              {devLink && (
                <Link href={devLink} className="block break-all text-sm text-accent hover:underline">
                  {devLink}
                </Link>
              )}
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "Enviando…" : "Enviar enlace de acceso"}
              </button>
            </form>
          )}

          <p className="mt-4 text-center text-sm text-muted">
            ¿No tienes cuenta?{" "}
            <Link href="/registro" className="text-accent hover:underline">
              Regístrate
            </Link>
          </p>
        </Panel>
      </main>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-muted">{label}</span>
      {children}
    </label>
  );
}
