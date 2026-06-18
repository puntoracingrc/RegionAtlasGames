"use client";

import { useMemo, useState } from "react";
import type { NewsSettings } from "@/lib/news-settings";

type Props = {
  initialSettings: NewsSettings;
  cacheCounts: Record<string, number>;
};

type SaveState = "idle" | "saving" | "saved" | "error";

const sectionToggles = [
  { key: "home", label: "Home", description: "Actualidad general en la portada." },
  { key: "companies", label: "Compañías", description: "Solo en la página general de compañías." },
] as const;

const platformToggles = [
  { key: "playstation", label: "PlayStation", description: "PS1, PS2, PS3, PS4, PS5, PSP y PS Vita." },
  { key: "nintendo", label: "Nintendo", description: "NES, SNES, N64, Game Boy, Wii, DS, 3DS, Switch y familia." },
  { key: "snk", label: "SNK / Neo Geo", description: "Neo Geo y consolas SNK relacionadas." },
  { key: "sega", label: "SEGA", description: "Master System, Mega Drive, Mega CD, 32X, Saturn, Dreamcast y Game Gear." },
] as const;

function listToText(values: string[]): string {
  return values.join("\n");
}

function textToList(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function AdminNewsSettingsPanel({ initialSettings, cacheCounts }: Props) {
  const [settings, setSettings] = useState(initialSettings);
  const [blockedDomainsText, setBlockedDomainsText] = useState(listToText(initialSettings.blockedDomains));
  const [blockedSourcesText, setBlockedSourcesText] = useState(listToText(initialSettings.blockedSources));
  const [blockedTermsText, setBlockedTermsText] = useState(listToText(initialSettings.blockedTerms));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");

  const payload = useMemo<NewsSettings>(() => ({
    ...settings,
    blockedDomains: textToList(blockedDomainsText),
    blockedSources: textToList(blockedSourcesText),
    blockedTerms: textToList(blockedTermsText),
  }), [blockedDomainsText, blockedSourcesText, blockedTermsText, settings]);

  async function saveSettings() {
    setSaveState("saving");
    setMessage("");
    const response = await fetch("/api/admin/news-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null) as { ok?: boolean; settings?: NewsSettings; error?: string } | null;
    if (!response.ok || !data?.ok || !data.settings) {
      setSaveState("error");
      setMessage(data?.error ?? "No se pudieron guardar los ajustes.");
      return;
    }
    setSettings(data.settings);
    setBlockedDomainsText(listToText(data.settings.blockedDomains));
    setBlockedSourcesText(listToText(data.settings.blockedSources));
    setBlockedTermsText(listToText(data.settings.blockedTerms));
    setSaveState("saved");
    setMessage("Ajustes guardados. La web los aplica al momento y el cron los usará en el próximo refresco.");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent">Noticias</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground">Control de actualidad</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              Enciende o apaga bloques de noticias y bloquea fuentes que no quieras ver en Region Atlas.
            </p>
          </div>
          <button
            type="button"
            onClick={saveSettings}
            disabled={saveState === "saving"}
            className="btn-primary"
          >
            {saveState === "saving" ? "Guardando..." : "Guardar ajustes"}
          </button>
        </div>
        {message && (
          <p className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
            saveState === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}>
            {message}
          </p>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-border bg-card p-5 md:p-6">
          <h2 className="text-xl font-bold text-foreground">Secciones</h2>
          <div className="mt-4 space-y-3">
            {sectionToggles.map((item) => (
              <label key={item.key} className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-border bg-background/50 p-4">
                <span>
                  <span className="block font-semibold text-foreground">{item.label}</span>
                  <span className="mt-1 block text-sm text-muted">{item.description}</span>
                  <span className="mt-2 block text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                    {cacheCounts[item.key] ?? 0} noticias en caché
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={settings.sections[item.key]}
                  onChange={(event) => setSettings((current) => ({
                    ...current,
                    sections: { ...current.sections, [item.key]: event.target.checked },
                  }))}
                  className="h-6 w-6 accent-[var(--accent)]"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-5 md:p-6">
          <h2 className="text-xl font-bold text-foreground">Familias de plataformas</h2>
          <div className="mt-4 space-y-3">
            {platformToggles.map((item) => (
              <label key={item.key} className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-border bg-background/50 p-4">
                <span>
                  <span className="block font-semibold text-foreground">{item.label}</span>
                  <span className="mt-1 block text-sm text-muted">{item.description}</span>
                  <span className="mt-2 block text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                    {cacheCounts[item.key] ?? 0} noticias en caché
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={settings.platformTopics[item.key]}
                  onChange={(event) => setSettings((current) => ({
                    ...current,
                    platformTopics: { ...current.platformTopics, [item.key]: event.target.checked },
                  }))}
                  className="h-6 w-6 accent-[var(--accent)]"
                />
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <BlockList
          title="Dominios bloqueados"
          hint="Uno por línea. Ej: okdiario.com"
          value={blockedDomainsText}
          onChange={setBlockedDomainsText}
        />
        <BlockList
          title="Fuentes bloqueadas"
          hint="Nombre de fuente de Google News. Ej: Marca"
          value={blockedSourcesText}
          onChange={setBlockedSourcesText}
        />
        <BlockList
          title="Palabras bloqueadas"
          hint="Si aparece en titular o resumen, se oculta. Ej: apuestas"
          value={blockedTermsText}
          onChange={setBlockedTermsText}
        />
      </section>
    </div>
  );
}

function BlockList({ title, hint, value, onChange }: {
  title: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block rounded-3xl border border-border bg-card p-5 md:p-6">
      <span className="block text-lg font-bold text-foreground">{title}</span>
      <span className="mt-1 block text-sm text-muted">{hint}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={10}
        className="mt-4 w-full rounded-2xl border border-border bg-background/70 px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent"
      />
    </label>
  );
}
