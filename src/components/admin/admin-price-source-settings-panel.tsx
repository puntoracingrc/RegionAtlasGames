"use client";

import { useMemo, useState } from "react";
import type { PriceCustomSourceSetting, PriceSourceSettings } from "@/lib/price-source-settings";

type Props = {
  initialSettings: PriceSourceSettings;
};

type SaveState = "idle" | "saving" | "saved" | "error";
type WorkerSyncState = "idle" | "syncing" | "synced" | "error";

const priceCollectorSourceOrder = [
  "wallapop",
  "ebay",
  "vinted",
  "cex",
  "jgo",
  "chollo",
  "kaoto",
  "todoconsolas",
  "todocoleccion",
] as const;

const emptyCustomSource: PriceCustomSourceSetting = {
  id: "",
  label: "",
  url: "",
  routeHint: "",
  enabled: true,
  notes: "",
};

export function AdminPriceSourceSettingsPanel({ initialSettings }: Props) {
  const [settings, setSettings] = useState(initialSettings);
  const [draftCustom, setDraftCustom] = useState<PriceCustomSourceSetting>(emptyCustomSource);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [workerSyncState, setWorkerSyncState] = useState<WorkerSyncState>("idle");
  const [message, setMessage] = useState("");

  const activeCount = useMemo(
    () => priceCollectorSourceOrder.filter((key) => settings.sources[key].enabled).length,
    [settings],
  );

  function toggleSource(key: keyof PriceSourceSettings["sources"], enabled: boolean) {
    setSettings((current) => ({
      ...current,
      sources: {
        ...current.sources,
        [key]: { ...current.sources[key], enabled },
      },
    }));
  }

  function updateSourceHint(key: keyof PriceSourceSettings["sources"], routeHint: string) {
    setSettings((current) => ({
      ...current,
      sources: {
        ...current.sources,
        [key]: { ...current.sources[key], routeHint },
      },
    }));
  }

  function addCustomSource() {
    if (!draftCustom.label.trim() || !draftCustom.url.trim()) {
      setSaveState("error");
      setMessage("Pon al menos nombre y URL para añadir una fuente candidata.");
      return;
    }
    const id = draftCustom.id.trim() || draftCustom.label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    setSettings((current) => ({
      ...current,
      customSources: [
        ...current.customSources.filter((item) => item.id !== id),
        { ...draftCustom, id, label: draftCustom.label.trim(), url: draftCustom.url.trim(), routeHint: draftCustom.routeHint?.trim(), notes: draftCustom.notes?.trim() },
      ],
    }));
    setDraftCustom(emptyCustomSource);
    setSaveState("idle");
    setMessage("");
  }

  function removeCustomSource(id: string) {
    setSettings((current) => ({
      ...current,
      customSources: current.customSources.filter((item) => item.id !== id),
    }));
  }

  async function saveSettings() {
    setSaveState("saving");
    setMessage("");
    const response = await fetch("/api/admin/price-sources", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const data = await response.json().catch(() => null) as { ok?: boolean; settings?: PriceSourceSettings; error?: string } | null;
    if (!response.ok || !data?.ok || !data.settings) {
      setSaveState("error");
      setMessage(data?.error ?? "No se pudieron guardar las fuentes.");
      return;
    }
    setSettings(data.settings);
    setSaveState("saved");
    setMessage("Fuentes guardadas en la web y en el worker. La próxima rueda usará estos collectors reales.");
  }

  async function syncWorker() {
    setWorkerSyncState("syncing");
    setMessage("");
    const response = await fetch("/api/admin/price-worker/sync", { method: "POST" });
    const data = await response.json().catch(() => null) as { ok?: boolean; uploaded?: unknown[]; error?: string } | null;
    if (!response.ok || !data?.ok) {
      setWorkerSyncState("error");
      setSaveState("error");
      setMessage(data?.error ?? "No se pudo sincronizar el worker.");
      return;
    }
    setWorkerSyncState("synced");
    setSaveState("saved");
    setMessage(`Worker sincronizado: ${data.uploaded?.length ?? 0} archivos subidos.`);
  }

  return (
    <section className="rounded-3xl border border-emerald-300/70 bg-emerald-50/70 p-5 shadow-sm dark:border-emerald-400/30 dark:bg-emerald-950/25 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700 dark:text-emerald-300">Fuentes</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-foreground">Fuentes de recolección de precios</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-muted">
            Activa o apaga collectors reales. Las webs candidatas quedan guardadas como rutas de apoyo: sirven para documentar dónde buscar, pero necesitan collector propio antes de entrar en la rueda automática.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={saveSettings} disabled={saveState === "saving"} className="btn-primary">
            {saveState === "saving" ? "Guardando..." : `Guardar fuentes (${activeCount} activas)`}
          </button>
          <button
            type="button"
            onClick={syncWorker}
            disabled={workerSyncState === "syncing"}
            className="btn-secondary"
          >
            {workerSyncState === "syncing" ? "Sincronizando..." : "Sincronizar worker"}
          </button>
        </div>
      </div>

      {message ? (
        <p className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${saveState === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {message}
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {priceCollectorSourceOrder.map((key) => {
          const source = settings.sources[key];
          return (
            <div key={key} className="rounded-2xl border border-border bg-background/70 p-4">
              <label className="flex cursor-pointer items-start justify-between gap-3">
                <span>
                  <span className="block font-bold text-foreground">{source.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted">{source.description}</span>
                </span>
                <input
                  type="checkbox"
                  checked={source.enabled}
                  onChange={(event) => toggleSource(key, event.target.checked)}
                  className="mt-1 h-5 w-5 accent-[var(--accent)]"
                />
              </label>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
                Collector real · {source.enabled ? "entra en la rueda si la plataforma lo soporta" : "apagado para la rueda"}
              </p>
              <input
                value={source.routeHint ?? ""}
                onChange={(event) => updateSourceHint(key, event.target.value)}
                placeholder="Ruta o pista opcional para esta fuente"
                className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition focus:border-accent"
              />
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-2xl border border-border bg-background/70 p-4">
        <h3 className="text-lg font-bold text-foreground">Añadir web candidata</h3>
        <p className="mt-1 text-xs leading-5 text-muted">
          Esto no scrapea solo por arte de magia —ojalá—, pero deja la web registrada para convertirla después en collector real.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1.4fr_1fr_auto]">
          <input
            value={draftCustom.label}
            onChange={(event) => setDraftCustom((current) => ({ ...current, label: event.target.value }))}
            placeholder="Nombre: Ej. Tienda X"
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
          <input
            value={draftCustom.url}
            onChange={(event) => setDraftCustom((current) => ({ ...current, url: event.target.value }))}
            placeholder="URL base o ruta"
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
          <input
            value={draftCustom.routeHint ?? ""}
            onChange={(event) => setDraftCustom((current) => ({ ...current, routeHint: event.target.value }))}
            placeholder="Pista: /buscar?q={title}"
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
          <button type="button" onClick={addCustomSource} className="btn-secondary whitespace-nowrap">Añadir</button>
        </div>
        {settings.customSources.length > 0 ? (
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {settings.customSources.map((source) => (
              <div key={source.id} className="rounded-xl border border-border bg-card/70 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{source.label}</p>
                    <p className="break-all text-xs text-muted">{source.url}</p>
                    {source.routeHint ? <p className="mt-1 text-xs text-muted">Ruta: {source.routeHint}</p> : null}
                  </div>
                  <button type="button" onClick={() => removeCustomSource(source.id)} className="text-xs font-semibold text-rose-600 dark:text-rose-300">Quitar</button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
