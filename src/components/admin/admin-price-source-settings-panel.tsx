"use client";

import { useMemo, useState } from "react";
import type {
  PriceCustomSourceSetting,
  PriceSourceNormalization,
  PriceSourceSettings,
  PriceSourceStatus,
  PriceSourceStrategy,
} from "@/lib/price-source-settings";

type Props = {
  initialSettings: PriceSourceSettings;
  platformOptions: PriceSourceFilterOption[];
  regionOptions: PriceSourceFilterOption[];
};
type PriceSourceFilterOption = {
  value: string;
  label: string;
  helper?: string;
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
  strategy: "manual_candidate",
  status: "candidate",
  queryTemplate: "{title}",
  urlTemplate: "",
  normalizations: ["decode_html_entities", "title_only"],
  enabledPlatforms: [],
  disabledPlatforms: [],
  enabledRegions: [],
  disabledRegions: [],
  platformRoutes: {},
};

const strategyOptions: Array<{ value: PriceSourceStrategy; label: string }> = [
  { value: "internal_search", label: "Buscador interno" },
  { value: "catalog_crawl", label: "Rastreo catálogo/listado" },
  { value: "base_url", label: "Ruta directa/base URL" },
  { value: "platform_routes", label: "Rutas por plataforma" },
  { value: "sequence", label: "Secuencia ruta → filtro → resultados" },
  { value: "api", label: "API" },
  { value: "manual_candidate", label: "Manual/candidata" },
];

const statusOptions: Array<{ value: PriceSourceStatus; label: string }> = [
  { value: "active", label: "Activa en rueda" },
  { value: "candidate", label: "Candidata sin collector" },
  { value: "needs_review", label: "Necesita revisión" },
  { value: "blocked_403", label: "Bloqueada 403" },
  { value: "blocked_429", label: "Bloqueada 429" },
  { value: "disabled", label: "Apagada" },
];

const normalizationOptions: Array<{ value: PriceSourceNormalization; label: string }> = [
  { value: "decode_html_entities", label: "Limpiar HTML entities" },
  { value: "strip_region", label: "Quitar región" },
  { value: "strip_platform", label: "Quitar plataforma" },
  { value: "trim_edition", label: "Recortar edición" },
  { value: "title_only", label: "Solo título limpio" },
  { value: "keep_title_color_word", label: "Mantener Color si va en título" },
];

function routesToText(value: Record<string, string> | undefined): string {
  return Object.entries(value ?? {})
    .map(([platform, route]) => `${platform}: ${route}`)
    .join("\n");
}

function textToRoutes(value: string): Record<string, string> | undefined {
  const routes: Record<string, string> = {};
  for (const line of value.split("\n")) {
    const [rawPlatform, ...rawRoute] = line.split(":");
    const platform = rawPlatform?.trim().toLowerCase();
    const route = rawRoute.join(":").trim();
    if (platform && route) routes[platform] = route;
  }
  return Object.keys(routes).length > 0 ? routes : undefined;
}

function toggleListValue(current: string[] | undefined, value: string, enabled: boolean): string[] | undefined {
  const currentSet = new Set(current ?? []);
  if (enabled) {
    currentSet.add(value);
  } else {
    currentSet.delete(value);
  }
  return currentSet.size > 0 ? Array.from(currentSet) : undefined;
}

function IncludedChecklist({
  title,
  helper,
  options,
  selected,
  legacyExcluded,
  onChange,
}: {
  title: string;
  helper: string;
  options: PriceSourceFilterOption[];
  selected: string[] | undefined;
  legacyExcluded?: string[];
  onChange: (next: string[] | undefined) => void;
}) {
  const selectedSet = new Set(selected ?? []);
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-foreground">{title}</p>
          <p className="mt-1 text-[11px] leading-4 text-muted">{helper}</p>
        </div>
        {selectedSet.size > 0 ? (
          <button type="button" onClick={() => onChange(undefined)} className="text-[11px] font-semibold text-accent">
            Vaciar = todas
          </button>
        ) : null}
      </div>
      {legacyExcluded?.length ? (
        <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-800 dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-200">
          Hay exclusiones antiguas guardadas ({legacyExcluded.join(", ")}). Se mantienen por compatibilidad, pero esta ficha usa inclusiones positivas.
        </p>
      ) : null}
      <div className="mt-3 grid max-h-48 gap-2 overflow-auto pr-1 sm:grid-cols-2">
        {options.map((option) => (
          <label key={option.value} className="flex items-start gap-2 rounded-xl border border-border bg-background/70 px-3 py-2 text-xs">
            <input
              type="checkbox"
              checked={selectedSet.has(option.value)}
              onChange={(event) => onChange(toggleListValue(selected, option.value, event.target.checked))}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>
              <span className="block font-semibold text-foreground">{option.label}</span>
              <span className="block text-[11px] text-muted">{option.helper ? `${option.value} · ${option.helper}` : option.value}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function AdminPriceSourceSettingsPanel({ initialSettings, platformOptions, regionOptions }: Props) {
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

  function updateSourceField<K extends keyof PriceSourceSettings["sources"][keyof PriceSourceSettings["sources"]]>(
    key: keyof PriceSourceSettings["sources"],
    field: K,
    value: PriceSourceSettings["sources"][keyof PriceSourceSettings["sources"]][K],
  ) {
    setSettings((current) => ({
      ...current,
      sources: {
        ...current.sources,
        [key]: { ...current.sources[key], [field]: value },
      },
    }));
  }

  function toggleSourceNormalization(key: keyof PriceSourceSettings["sources"], value: PriceSourceNormalization, enabled: boolean) {
    setSettings((current) => {
      const currentList = current.sources[key].normalizations ?? [];
      const nextList = enabled
        ? Array.from(new Set([...currentList, value]))
        : currentList.filter((item) => item !== value);
      return {
        ...current,
        sources: {
          ...current.sources,
          [key]: { ...current.sources[key], normalizations: nextList },
        },
      };
    });
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
        {
          ...draftCustom,
          id,
          label: draftCustom.label.trim(),
          url: draftCustom.url.trim(),
          routeHint: draftCustom.routeHint?.trim(),
          notes: draftCustom.notes?.trim(),
          queryTemplate: draftCustom.queryTemplate?.trim(),
          urlTemplate: draftCustom.urlTemplate?.trim(),
          enabledPlatforms: draftCustom.enabledPlatforms?.filter(Boolean),
          enabledRegions: draftCustom.enabledRegions?.filter(Boolean),
        },
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

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
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
                Ficha de fuente · {source.enabled ? "puede entrar en la rueda si la plataforma/región lo permite" : "apagada para la rueda"}
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="text-xs font-semibold text-muted">
                  Estrategia
                  <select
                    value={source.strategy ?? "internal_search"}
                    onChange={(event) => updateSourceField(key, "strategy", event.target.value as PriceSourceStrategy)}
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition focus:border-accent"
                  >
                    {strategyOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-muted">
                  Estado real
                  <select
                    value={source.status ?? (source.enabled ? "active" : "disabled")}
                    onChange={(event) => updateSourceField(key, "status", event.target.value as PriceSourceStatus)}
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition focus:border-accent"
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-muted">
                  Query template
                  <input
                    value={source.queryTemplate ?? "{title}"}
                    onChange={(event) => updateSourceField(key, "queryTemplate", event.target.value)}
                    placeholder="{title}"
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition focus:border-accent"
                  />
                </label>
                <label className="text-xs font-semibold text-muted">
                  URL template
                  <input
                    value={source.urlTemplate ?? ""}
                    onChange={(event) => updateSourceField(key, "urlTemplate", event.target.value)}
                    placeholder="/buscar?q={title}"
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition focus:border-accent"
                  />
                </label>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <IncludedChecklist
                  title="Plataformas incluidas"
                  helper="Vacío = todas las plataformas. Marca solo las incluidas si quieres restringir esta fuente."
                  options={platformOptions}
                  selected={source.enabledPlatforms}
                  legacyExcluded={source.disabledPlatforms}
                  onChange={(next) => updateSourceField(key, "enabledPlatforms", next)}
                />
                <IncludedChecklist
                  title="Regiones incluidas"
                  helper="Vacío = todas las regiones. Marca solo las incluidas si esta fuente solo sirve para algunas."
                  options={regionOptions}
                  selected={source.enabledRegions}
                  legacyExcluded={source.disabledRegions}
                  onChange={(next) => updateSourceField(key, "enabledRegions", next)}
                />
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <input
                  value={source.routeHint ?? ""}
                  onChange={(event) => updateSourceHint(key, event.target.value)}
                  placeholder="Ruta o pista opcional para esta fuente"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition focus:border-accent"
                />
                <input
                  value={source.supportUrl ?? ""}
                  onChange={(event) => updateSourceField(key, "supportUrl", event.target.value)}
                  placeholder="URL general de apoyo"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition focus:border-accent"
                />
              </div>
              <textarea
                value={routesToText(source.platformRoutes)}
                onChange={(event) => updateSourceField(key, "platformRoutes", textToRoutes(event.target.value))}
                placeholder={"Rutas por plataforma, una por línea:\nps4: /juegos-ps4\nps5: /juegos-ps5"}
                className="mt-3 min-h-20 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition focus:border-accent"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {normalizationOptions.map((option) => (
                  <label key={option.value} className="rounded-full border border-border bg-card/60 px-3 py-1 text-[11px] font-semibold text-muted">
                    <input
                      type="checkbox"
                      checked={(source.normalizations ?? []).includes(option.value)}
                      onChange={(event) => toggleSourceNormalization(key, option.value, event.target.checked)}
                      className="mr-1 accent-[var(--accent)]"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
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
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <select
            value={draftCustom.strategy ?? "manual_candidate"}
            onChange={(event) => setDraftCustom((current) => ({ ...current, strategy: event.target.value as PriceSourceStrategy }))}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          >
            {strategyOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <input
            value={draftCustom.queryTemplate ?? ""}
            onChange={(event) => setDraftCustom((current) => ({ ...current, queryTemplate: event.target.value }))}
            placeholder="Query template: {title}"
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
          <input
            value={draftCustom.urlTemplate ?? ""}
            onChange={(event) => setDraftCustom((current) => ({ ...current, urlTemplate: event.target.value }))}
            placeholder="URL template: /buscar?q={title}"
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <IncludedChecklist
            title="Plataformas incluidas"
            helper="Vacío = todas las plataformas. Para una candidata actual, marca por ejemplo PS4/PS5."
            options={platformOptions}
            selected={draftCustom.enabledPlatforms}
            onChange={(next) => setDraftCustom((current) => ({ ...current, enabledPlatforms: next }))}
          />
          <IncludedChecklist
            title="Regiones incluidas"
            helper="Vacío = todas las regiones. Marca solo si la fuente sirve para regiones concretas."
            options={regionOptions}
            selected={draftCustom.enabledRegions}
            onChange={(next) => setDraftCustom((current) => ({ ...current, enabledRegions: next }))}
          />
        </div>
        {settings.customSources.length > 0 ? (
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {settings.customSources.map((source) => (
              <div key={source.id} className="rounded-xl border border-border bg-card/70 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{source.label}</p>
                    <p className="break-all text-xs text-muted">{source.url}</p>
                    <p className="mt-1 text-xs text-muted">
                      Estrategia: {strategyOptions.find((option) => option.value === source.strategy)?.label ?? "Manual/candidata"}
                    </p>
                    {source.queryTemplate ? <p className="mt-1 text-xs text-muted">Query: {source.queryTemplate}</p> : null}
                    {source.urlTemplate ? <p className="mt-1 text-xs text-muted">URL: {source.urlTemplate}</p> : null}
                    {source.enabledPlatforms?.length ? <p className="mt-1 text-xs text-muted">Plataformas incluidas: {source.enabledPlatforms.join(", ")}</p> : null}
                    {source.enabledRegions?.length ? <p className="mt-1 text-xs text-muted">Regiones incluidas: {source.enabledRegions.join(", ")}</p> : null}
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
