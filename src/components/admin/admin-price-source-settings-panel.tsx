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
  { value: "candidate", label: "Candidata / pendiente" },
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

const queryTemplatePresets = [
  { value: "{title}", label: "Solo título" },
  { value: "{title} {platform}", label: "Título + plataforma" },
  { value: "{title} {region}", label: "Título + región" },
] as const;

function queryTemplateMode(value: string | undefined): string {
  const template = value?.trim() || "{title}";
  return queryTemplatePresets.some((preset) => preset.value === template) ? template : "custom";
}

function strategyUsesQuery(strategy: PriceSourceStrategy | undefined): boolean {
  return strategy === "internal_search" || strategy === "sequence";
}

function strategyUsesSearchUrl(strategy: PriceSourceStrategy | undefined): boolean {
  return strategy === "internal_search" || strategy === "sequence";
}

function strategyUsesScope(strategy: PriceSourceStrategy | undefined): boolean {
  return strategy !== "manual_candidate";
}

function strategyUsesSupport(strategy: PriceSourceStrategy | undefined): boolean {
  return strategy === "catalog_crawl" || strategy === "base_url" || strategy === "sequence" || strategy === "manual_candidate";
}

function strategyUsesNormalizations(strategy: PriceSourceStrategy | undefined): boolean {
  return strategy === "internal_search" || strategy === "sequence" || strategy === "api";
}

function strategyUsesPlatformRoutes(strategy: PriceSourceStrategy | undefined): boolean {
  return strategy === "platform_routes";
}

function customSourceCanUseGenericCollector(source: PriceCustomSourceSetting): boolean {
  if (!source.enabled) return false;
  const status = source.status ?? "candidate";
  if (status === "disabled" || status === "blocked_403" || status === "blocked_429") return false;
  const strategy = source.strategy ?? "manual_candidate";
  if (strategy === "platform_routes") return Object.keys(source.platformRoutes ?? {}).length > 0;
  if (strategy === "internal_search" || strategy === "sequence") return Boolean(source.urlTemplate?.trim());
  if (strategy === "catalog_crawl" || strategy === "base_url") return Boolean(source.url?.trim());
  return false;
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

function QueryTemplatePicker({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (next: string) => void;
}) {
  const mode = queryTemplateMode(value);
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-3">
      <label className="text-xs font-semibold text-muted">
        Cómo buscar el juego
        <select
          value={mode}
          onChange={(event) => {
            const next = event.target.value;
            if (next !== "custom") onChange(next);
          }}
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition focus:border-accent"
        >
          {queryTemplatePresets.map((preset) => (
            <option key={preset.value} value={preset.value}>{preset.label}</option>
          ))}
          <option value="custom">Personalizada</option>
        </select>
      </label>
      {mode === "custom" ? (
        <input
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder="{title}"
          className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition focus:border-accent"
        />
      ) : null}
    </div>
  );
}

function updateRouteMap(current: Record<string, string> | undefined, platform: string, url: string): Record<string, string> | undefined {
  const next = { ...(current ?? {}) };
  const cleanUrl = url.trim();
  if (cleanUrl) {
    next[platform] = cleanUrl;
  } else {
    delete next[platform];
  }
  return Object.keys(next).length > 0 ? next : undefined;
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

function PlatformRoutesEditor({
  options,
  routes,
  onChange,
}: {
  options: PriceSourceFilterOption[];
  routes: Record<string, string> | undefined;
  onChange: (next: Record<string, string> | undefined) => void;
}) {
  return (
    <div className="mt-3 rounded-2xl border border-border bg-card/40 p-3">
      <p className="text-xs font-bold text-foreground">URLs por plataforma</p>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        Solo aparece para estrategia “Rutas por plataforma”. Si una plataforma no tiene URL, esa fuente no debe buscarla por ruta directa.
      </p>
      <div className="mt-3 grid max-h-72 gap-2 overflow-auto pr-1 md:grid-cols-2">
        {options.map((option) => (
          <label key={option.value} className="rounded-xl border border-border bg-background/70 p-3 text-xs">
            <span className="block font-semibold text-foreground">{option.label}</span>
            <span className="block text-[11px] text-muted">{option.helper ? `${option.value} · ${option.helper}` : option.value}</span>
            <input
              value={routes?.[option.value] ?? ""}
              onChange={(event) => onChange(updateRouteMap(routes, option.value, event.target.value))}
              placeholder="https://tienda.example/ruta-plataforma"
              className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition focus:border-accent"
            />
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
    () =>
      priceCollectorSourceOrder.filter((key) => settings.sources[key].enabled).length
      + settings.customSources.filter(customSourceCanUseGenericCollector).length,
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

  function updateSourcePlatformRoutes(key: keyof PriceSourceSettings["sources"], routes: Record<string, string> | undefined) {
    updateSourceField(key, "platformRoutes", routes);
  }

  function updateCustomSourceField<K extends keyof PriceCustomSourceSetting>(
    id: string,
    field: K,
    value: PriceCustomSourceSetting[K],
  ) {
    setSettings((current) => ({
      ...current,
      customSources: current.customSources.map((source) =>
        source.id === id ? { ...source, [field]: value } : source,
      ),
    }));
  }

  function toggleCustomSourceNormalization(id: string, value: PriceSourceNormalization, enabled: boolean) {
    setSettings((current) => ({
      ...current,
      customSources: current.customSources.map((source) => {
        if (source.id !== id) return source;
        const currentList = source.normalizations ?? [];
        const nextList = enabled
          ? Array.from(new Set([...currentList, value]))
          : currentList.filter((item) => item !== value);
        return { ...source, normalizations: nextList };
      }),
    }));
  }

  function updateCustomSourcePlatformRoutes(id: string, routes: Record<string, string> | undefined) {
    updateCustomSourceField(id, "platformRoutes", routes);
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
    const data = await response.json().catch(() => null) as {
      ok?: boolean;
      settings?: PriceSourceSettings;
      worker?: { ok?: boolean; skipped?: boolean; reason?: string };
      error?: string;
    } | null;
    if (!response.ok || !data?.ok || !data.settings) {
      setSaveState("error");
      setMessage(data?.error ?? "No se pudieron guardar las fuentes.");
      return;
    }
    setSettings(data.settings);
    if (data.worker?.ok) {
      setSaveState("saved");
      setMessage("Fuentes guardadas y sincronizadas con el worker externo. La próxima rueda usará este estado.");
    } else {
      setSaveState("error");
      setMessage(
        data.worker?.reason
          ? `Fuentes guardadas en la web, pero NO sincronizadas con el worker externo: ${data.worker.reason}`
          : "Fuentes guardadas en la web, pero NO se pudo confirmar la sincronización con el worker externo.",
      );
    }
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
            Activa o apaga collectors. Las fuentes configuradas con datos suficientes entran por el collector genérico; si faltan rutas o buscador quedan guardadas como pendientes.
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
          const strategy = source.strategy ?? "internal_search";
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
              </div>
              {strategyUsesQuery(strategy) ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <QueryTemplatePicker
                    value={source.queryTemplate}
                    onChange={(next) => updateSourceField(key, "queryTemplate", next)}
                  />
                  {strategyUsesSearchUrl(strategy) ? (
                    <label className="rounded-2xl border border-border bg-card/40 p-3 text-xs font-semibold text-muted">
                      URL de búsqueda
                      <input
                        value={source.urlTemplate ?? ""}
                        onChange={(event) => updateSourceField(key, "urlTemplate", event.target.value)}
                        placeholder="https://tienda.com/search?q={title}"
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition focus:border-accent"
                      />
                      <span className="mt-1 block text-[11px] font-normal leading-4">Usa {"{title}"} donde va el nombre del juego.</span>
                    </label>
                  ) : null}
                </div>
              ) : null}
              {strategyUsesScope(strategy) ? (
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
              ) : null}
              {strategyUsesSupport(strategy) ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <input
                    value={source.routeHint ?? ""}
                    onChange={(event) => updateSourceHint(key, event.target.value)}
                    placeholder="Pista interna o pasos de búsqueda"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition focus:border-accent"
                  />
                  <input
                    value={source.supportUrl ?? ""}
                    onChange={(event) => updateSourceField(key, "supportUrl", event.target.value)}
                    placeholder="URL general o catálogo"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition focus:border-accent"
                  />
                </div>
              ) : null}
              {strategyUsesPlatformRoutes(strategy) ? (
                <PlatformRoutesEditor
                  options={platformOptions}
                  routes={source.platformRoutes}
                  onChange={(next) => updateSourcePlatformRoutes(key, next)}
                />
              ) : source.platformRoutes && Object.keys(source.platformRoutes).length > 0 ? (
                <p className="mt-3 rounded-xl border border-border bg-card/50 px-3 py-2 text-[11px] leading-4 text-muted">
                  Hay URLs por plataforma guardadas. Cambia la estrategia a “Rutas por plataforma” para editarlas; no se borran al usar otra estrategia.
                </p>
              ) : null}
              {strategyUsesNormalizations(strategy) ? (
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
              ) : null}
            </div>
          );
        })}
        {settings.customSources.map((source) => {
          const strategy = source.strategy ?? "manual_candidate";
          const hasGenericCollector = customSourceCanUseGenericCollector(source);
          return (
            <div key={`custom-${source.id}`} className="rounded-2xl border border-amber-300/70 bg-amber-50/60 p-4 dark:border-amber-400/30 dark:bg-amber-950/20">
              <label className="flex cursor-pointer items-start justify-between gap-3">
                <span>
                  <span className="block font-bold text-foreground">{source.label}</span>
                  <span className="mt-1 block break-all text-xs leading-5 text-muted">{source.url}</span>
                </span>
                <input
                  type="checkbox"
                  checked={source.enabled}
                  onChange={(event) => updateCustomSourceField(source.id, "enabled", event.target.checked)}
                  className="mt-1 h-5 w-5 accent-[var(--accent)]"
                />
              </label>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  {hasGenericCollector
                    ? "Ficha configurable · entra por collector genérico si plataforma/región encajan"
                    : "Ficha candidata · faltan datos ejecutables para entrar en la rueda"}
                </p>
                <button type="button" onClick={() => removeCustomSource(source.id)} className="text-xs font-semibold text-rose-600 dark:text-rose-300">
                  Quitar
                </button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="text-xs font-semibold text-muted">
                  Nombre
                  <input
                    value={source.label}
                    onChange={(event) => updateCustomSourceField(source.id, "label", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition focus:border-accent"
                  />
                </label>
                <label className="text-xs font-semibold text-muted">
                  URL general
                  <input
                    value={source.url}
                    onChange={(event) => updateCustomSourceField(source.id, "url", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition focus:border-accent"
                  />
                </label>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="text-xs font-semibold text-muted">
                  Estrategia
                  <select
                    value={strategy}
                    onChange={(event) => updateCustomSourceField(source.id, "strategy", event.target.value as PriceSourceStrategy)}
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
                    value={source.status ?? (source.enabled ? "candidate" : "disabled")}
                    onChange={(event) => updateCustomSourceField(source.id, "status", event.target.value as PriceSourceStatus)}
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition focus:border-accent"
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              {strategyUsesQuery(strategy) ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <QueryTemplatePicker
                    value={source.queryTemplate}
                    onChange={(next) => updateCustomSourceField(source.id, "queryTemplate", next)}
                  />
                  {strategyUsesSearchUrl(strategy) ? (
                    <label className="rounded-2xl border border-border bg-card/40 p-3 text-xs font-semibold text-muted">
                      URL de búsqueda
                      <input
                        value={source.urlTemplate ?? ""}
                        onChange={(event) => updateCustomSourceField(source.id, "urlTemplate", event.target.value)}
                        placeholder="https://tienda.com/search?q={title}"
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition focus:border-accent"
                      />
                      <span className="mt-1 block text-[11px] font-normal leading-4">Usa {"{title}"} donde va el nombre del juego.</span>
                    </label>
                  ) : null}
                </div>
              ) : null}
              {strategyUsesScope(strategy) ? (
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <IncludedChecklist
                    title="Plataformas incluidas"
                    helper="Vacío = todas las plataformas. Marca solo las incluidas si quieres restringir esta fuente."
                    options={platformOptions}
                    selected={source.enabledPlatforms}
                    legacyExcluded={source.disabledPlatforms}
                    onChange={(next) => updateCustomSourceField(source.id, "enabledPlatforms", next)}
                  />
                  <IncludedChecklist
                    title="Regiones incluidas"
                    helper="Vacío = todas las regiones. Marca solo las incluidas si esta fuente solo sirve para algunas."
                    options={regionOptions}
                    selected={source.enabledRegions}
                    legacyExcluded={source.disabledRegions}
                    onChange={(next) => updateCustomSourceField(source.id, "enabledRegions", next)}
                  />
                </div>
              ) : null}
              {strategyUsesSupport(strategy) ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <input
                    value={source.routeHint ?? ""}
                    onChange={(event) => updateCustomSourceField(source.id, "routeHint", event.target.value)}
                    placeholder="Pista interna o pasos de búsqueda"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition focus:border-accent"
                  />
                  <textarea
                    value={source.notes ?? ""}
                    onChange={(event) => updateCustomSourceField(source.id, "notes", event.target.value)}
                    placeholder="Notas internas"
                    rows={2}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition focus:border-accent"
                  />
                </div>
              ) : null}
              {strategyUsesPlatformRoutes(strategy) ? (
                <PlatformRoutesEditor
                  options={platformOptions}
                  routes={source.platformRoutes}
                  onChange={(next) => updateCustomSourcePlatformRoutes(source.id, next)}
                />
              ) : source.platformRoutes && Object.keys(source.platformRoutes).length > 0 ? (
                <p className="mt-3 rounded-xl border border-border bg-card/50 px-3 py-2 text-[11px] leading-4 text-muted">
                  Hay URLs por plataforma guardadas. Cambia la estrategia a “Rutas por plataforma” para editarlas; no se borran al usar otra estrategia.
                </p>
              ) : null}
              {strategyUsesNormalizations(strategy) ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {normalizationOptions.map((option) => (
                    <label key={option.value} className="rounded-full border border-border bg-card/60 px-3 py-1 text-[11px] font-semibold text-muted">
                      <input
                        type="checkbox"
                        checked={(source.normalizations ?? []).includes(option.value)}
                        onChange={(event) => toggleCustomSourceNormalization(source.id, option.value, event.target.checked)}
                        className="mr-1 accent-[var(--accent)]"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-2xl border border-border bg-background/70 p-4">
        <h3 className="text-lg font-bold text-foreground">Añadir web candidata</h3>
        <p className="mt-1 text-xs leading-5 text-muted">
          Si añades rutas por plataforma o un buscador válido, la fuente podrá probarse con el collector genérico. Si faltan datos, queda guardada como pendiente.
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
        </div>
        {strategyUsesQuery(draftCustom.strategy) ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <QueryTemplatePicker
              value={draftCustom.queryTemplate}
              onChange={(next) => setDraftCustom((current) => ({ ...current, queryTemplate: next }))}
            />
            {strategyUsesSearchUrl(draftCustom.strategy) ? (
              <label className="rounded-2xl border border-border bg-card/40 p-3 text-xs font-semibold text-muted">
                URL de búsqueda
                <input
                  value={draftCustom.urlTemplate ?? ""}
                  onChange={(event) => setDraftCustom((current) => ({ ...current, urlTemplate: event.target.value }))}
                  placeholder="https://tienda.com/search?q={title}"
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-accent"
                />
                <span className="mt-1 block text-[11px] font-normal leading-4">Usa {"{title}"} donde va el nombre del juego.</span>
              </label>
            ) : null}
          </div>
        ) : null}
        {strategyUsesScope(draftCustom.strategy) ? (
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
        ) : null}
        {strategyUsesPlatformRoutes(draftCustom.strategy) ? (
          <PlatformRoutesEditor
            options={platformOptions}
            routes={draftCustom.platformRoutes}
            onChange={(next) => setDraftCustom((current) => ({ ...current, platformRoutes: next }))}
          />
        ) : null}
        {settings.customSources.length > 0 ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-200">
            Las webs candidatas añadidas aparecen como fichas editables en el listado principal de arriba. Si tienen configuración suficiente, el worker las ejecuta mediante el collector genérico.
          </p>
        ) : null}
      </div>
    </section>
  );
}
