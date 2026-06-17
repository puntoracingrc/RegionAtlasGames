"use client";

import { useState } from "react";

type Props = {
  initialCity: string | null;
};

export function AccountProfileSettings({ initialCity }: Props) {
  const [city, setCity] = useState(initialCity ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    const res = await fetch("/api/user/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo guardar la ciudad.");
      return;
    }
    setMessage("Ciudad guardada.");
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-card-hover/60 p-4">
      <label className="block space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wider text-muted">
          Ciudad para compraventa
        </span>
        <input
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="input"
          placeholder="Ej. Madrid"
          autoComplete="address-level2"
        />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-secondary" disabled={saving} onClick={save}>
          {saving ? "Guardando…" : "Guardar ciudad"}
        </button>
        {message && <span className="text-sm text-emerald-700 dark:text-emerald-300">{message}</span>}
        {error && <span className="text-sm text-rose-700 dark:text-rose-300">{error}</span>}
      </div>
    </div>
  );
}
