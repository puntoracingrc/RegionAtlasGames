"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminNotice, adminToneClass } from "@/components/admin/admin-visual";
import { Panel, PanelTitle } from "@/components/ui";

type ContributorRow = {
  email: string;
  addedAt: string;
  addedBy: string;
};

export function AdminContributorsPanel() {
  const [contributors, setContributors] = useState<ContributorRow[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/contributors");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo cargar la lista.");
        return;
      }
      setContributors(data.contributors ?? []);
    } catch {
      setError("Error de red.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function addContributor(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/contributors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo añadir.");
        return;
      }
      setEmail("");
      setMessage(`${data.contributor.email} puede crear fichas y enviarlas a revisión.`);
      await reload();
    } catch {
      setError("Error de red.");
    } finally {
      setSaving(false);
    }
  }

  async function removeContributor(target: string) {
    if (!confirm(`¿Quitar permisos de colaborador a ${target}?`)) return;

    setRemovingEmail(target);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/contributors/${encodeURIComponent(target)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo quitar.");
        return;
      }
      setMessage(`Permisos retirados a ${target}.`);
      await reload();
    } catch {
      setError("Error de red.");
    } finally {
      setRemovingEmail(null);
    }
  }

  return (
    <div className="space-y-6">
      <Panel className={adminToneClass("edit")}>
        <PanelTitle eyebrow="Permisos">Añadir colaborador</PanelTitle>
        <p className="mb-5 max-w-3xl text-sm leading-6 text-muted">
          El usuario debe tener cuenta en la web (mismo email). Podrá crear fichas nuevas y enviarlas
          a revisión. No puede borrar ni editar fichas ya publicadas ni las de otros.
        </p>
        <form
          onSubmit={addContributor}
          className="flex max-w-2xl flex-wrap items-end gap-3 rounded-2xl border border-border bg-background/45 p-4"
        >
          <label className="min-w-[240px] flex-1 space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-muted">Email</span>
            <input
              required
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colaborador@ejemplo.com"
            />
          </label>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Guardando…" : "Dar permiso"}
          </button>
        </form>
      </Panel>

      <Panel className={adminToneClass("status")}>
        <PanelTitle eyebrow="Equipo">Colaboradores ({contributors.length})</PanelTitle>
        {loading ? (
          <p className="text-sm text-muted">Cargando…</p>
        ) : contributors.length === 0 ? (
          <p className="text-sm text-muted">Ningún colaborador configurado.</p>
        ) : (
          <ul className="grid gap-3">
            {contributors.map((row) => (
              <li
                key={row.email}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-background/45 p-4 md:flex-row md:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{row.email}</p>
                  <p className="text-xs text-muted">
                    Alta {new Date(row.addedAt).toLocaleString("es-ES")} · por {row.addedBy}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-rose-400/40 px-3 py-1.5 text-xs font-medium text-rose-700 disabled:opacity-50 dark:text-rose-300"
                  disabled={removingEmail === row.email}
                  onClick={() => void removeContributor(row.email)}
                >
                  {removingEmail === row.email ? "Quitando…" : "Quitar permiso"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {message && <AdminNotice tone="status">{message}</AdminNotice>}
      {error && <AdminNotice tone="danger">{error}</AdminNotice>}
    </div>
  );
}
