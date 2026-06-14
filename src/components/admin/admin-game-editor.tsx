"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import type { AdminGameDraft } from "@/lib/admin-draft-types";
import type { CatalogStagingGame } from "@/lib/catalog-staging-types";
import { getCoverSrc } from "@/lib/cover-url";

type CompanyOption = { name: string; slug: string };

type Props = {
  pcId: number;
  initialDraft: AdminGameDraft;
  staging: CatalogStagingGame;
  companies: CompanyOption[];
  autoAi?: boolean;
};

type LogLine = { id: number; text: string; tone?: "ok" | "err" };

function EntityCombo({
  label,
  name,
  slug,
  options,
  onChange,
}: {
  label: string;
  name: string;
  slug: string;
  options: CompanyOption[];
  onChange: (name: string, slug: string) => void;
}) {
  const listId = `${label.replace(/\s+/g, "-").toLowerCase()}-list`;

  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-wider text-muted">{label}</span>
      <input
        list={listId}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        value={name}
        onChange={(e) => {
          const nextName = e.target.value;
          const match = options.find(
            (o) => o.name.toLowerCase() === nextName.toLowerCase(),
          );
          onChange(nextName, match?.slug ?? slug);
        }}
        placeholder="Elegir existente o escribir nueva"
      />
      <datalist id={listId}>
        {options.slice(0, 300).map((o) => (
          <option key={o.slug} value={o.name} />
        ))}
      </datalist>
    </label>
  );
}

export function AdminGameEditor({
  pcId,
  initialDraft,
  staging,
  companies,
  autoAi = false,
}: Props) {
  const [draft, setDraft] = useState(initialDraft);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logId = useRef(0);
  const autoAiStarted = useRef(false);

  const pushLog = useCallback((text: string, tone?: LogLine["tone"]) => {
    logId.current += 1;
    setLogs((prev) => [...prev.slice(-40), { id: logId.current, text, tone }]);
  }, []);

  const patchDraft = useCallback((patch: Partial<AdminGameDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  async function saveDraft(next?: Partial<AdminGameDraft>) {
    setSaving(true);
    setError(null);
    setMessage(null);
    const payload = { ...draft, ...next };
    try {
      const res = await fetch(`/api/admin/staging/${pcId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo guardar.");
        return false;
      }
      setDraft(data.draft);
      setMessage("Borrador guardado.");
      return true;
    } catch {
      setError("Error de red al guardar.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function runAiFill() {
    setAiRunning(true);
    setError(null);
    setMessage(null);
    setLogs([]);
    pushLog("Iniciando relleno con IA…");

    await saveDraft();

    try {
      const res = await fetch(`/api/admin/staging/${pcId}/ai-fill`, { method: "POST" });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "No se pudo iniciar la IA.");
        setAiRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          try {
            const event = JSON.parse(line.slice(5).trim()) as {
              type: string;
              message?: string;
              field?: string;
              value?: unknown;
              draft?: AdminGameDraft;
            };
            if (event.type === "log" && event.message) {
              pushLog(event.message);
            } else if (event.type === "field" && event.field) {
              if (event.field === "genres") {
                patchDraft({ genreNames: event.value as string[] });
                pushLog(`Géneros: ${(event.value as string[]).join(", ")}`, "ok");
              } else {
                patchDraft({ [event.field]: event.value } as Partial<AdminGameDraft>);
                pushLog(`Campo actualizado: ${event.field}`, "ok");
              }
            } else if (event.type === "error" && event.message) {
              pushLog(event.message, "err");
              setError(event.message);
            } else if (event.type === "done" && event.draft) {
              setDraft(event.draft);
              pushLog("IA terminada. Revisa y publica.", "ok");
              setMessage("Datos rellenados con IA.");
            }
          } catch {
            /* ignore malformed chunks */
          }
        }
      }
    } catch {
      setError("Conexión interrumpida con la IA.");
    } finally {
      setAiRunning(false);
    }
  }

  async function uploadCoverFile(file: File) {
    setCoverUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/staging/${pcId}/cover`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo subir la portada.");
        return;
      }
      patchDraft({ coverUrl: data.coverUrl });
      setMessage(`Portada subida: ${data.coverUrl}`);
    } catch {
      setError("Error al subir la portada.");
    } finally {
      setCoverUploading(false);
    }
  }

  async function enrichCover() {
    setEnriching(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/staging/${pcId}/enrich`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Enriquecimiento fallido.");
        return;
      }
      if (data.game?.coverUrl) {
        patchDraft({ coverUrl: data.game.coverUrl });
        setMessage("Portada obtenida de PriceCharting.");
      } else {
        setMessage("Enriquecimiento completado (sin portada nueva).");
      }
    } catch {
      setError("Error al enriquecer portada.");
    } finally {
      setEnriching(false);
    }
  }

  async function publish() {
    if (!confirm("¿Publicar este juego en el catálogo maestro?")) return;
    setPublishing(true);
    setError(null);
    const saved = await saveDraft();
    if (!saved) {
      setPublishing(false);
      return;
    }
    try {
      const res = await fetch(`/api/admin/staging/${pcId}/publish`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo publicar.");
        return;
      }
      setMessage(
        data.mode === "overlay"
          ? "Publicado en caliente (visible al instante en la web)."
          : data.mode === "both"
            ? "Publicado en caliente y guardado en catalog.json local."
            : "Publicado en catalog.json local.",
      );
      if (data.deployHook?.triggered) {
        setMessage((prev) => `${prev ?? ""} Deploy de Vercel disparado.`.trim());
      }
      window.location.href = data.url;
    } catch {
      setError("Error al publicar.");
    } finally {
      setPublishing(false);
    }
  }

  useEffect(() => {
    if (autoAi && !autoAiStarted.current) {
      autoAiStarted.current = true;
      void runAiFill();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAi]);

  const regionSlug =
    draft.region === "USA" ? "usa" : draft.region === "Japón" ? "japon" : "pal";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Panel>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <PanelTitle>Ficha de catálogo</PanelTitle>
              <p className="text-sm text-muted">
                {staging.importCount > 0
                  ? `${staging.userCount} usuarios · ${staging.unitCount} unidades importadas`
                  : staging.pcId < 0
                    ? "Entrada manual"
                    : "Cola de importación"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={staging.status === "enriched" ? "green" : "amber"}>
                {staging.status}
              </Badge>
              {staging.pcId > 0 && (
                <Badge tone="neutral">PC #{staging.pcId}</Badge>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-[10px] uppercase tracking-wider text-muted">Título</span>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={draft.title}
                onChange={(e) => patchDraft({ title: e.target.value })}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Slug URL</span>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-xs"
                value={draft.slug}
                onChange={(e) =>
                  patchDraft({
                    slug: e.target.value,
                    catalogId: `${draft.platformSlug}-${e.target.value}`,
                  })
                }
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">ID catálogo</span>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-xs"
                value={draft.catalogId}
                readOnly
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Plataforma</span>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={draft.platformSlug}
                readOnly
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Región</span>
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={draft.region}
                onChange={(e) => patchDraft({ region: e.target.value })}
              >
                <option value="PAL España">PAL España</option>
                <option value="USA">USA</option>
                <option value="Japón">Japón</option>
              </select>
            </label>

            <label className="block space-y-1 sm:col-span-2">
              <span className="text-[10px] uppercase tracking-wider text-muted">
                Referencia (SKU / CUSA / código)
              </span>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
                value={draft.reference ?? ""}
                onChange={(e) => patchDraft({ reference: e.target.value || null })}
                placeholder="ej. CUSA-12345, SLES-12345…"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Año</span>
              <input
                type="number"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={draft.year ?? ""}
                onChange={(e) =>
                  patchDraft({
                    year: e.target.value ? Number.parseInt(e.target.value, 10) : null,
                  })
                }
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Jugadores</span>
              <input
                type="number"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={draft.players ?? ""}
                onChange={(e) =>
                  patchDraft({
                    players: e.target.value ? Number.parseInt(e.target.value, 10) : null,
                  })
                }
              />
            </label>

            <EntityCombo
              label="Desarrolladora"
              name={draft.developerName ?? ""}
              slug={draft.developerSlug ?? ""}
              options={companies}
              onChange={(name, slug) => patchDraft({ developerName: name, developerSlug: slug })}
            />

            <EntityCombo
              label="Editora"
              name={draft.publisherName ?? ""}
              slug={draft.publisherSlug ?? ""}
              options={companies}
              onChange={(name, slug) => patchDraft({ publisherName: name, publisherSlug: slug })}
            />

            <label className="block space-y-1 sm:col-span-2">
              <span className="text-[10px] uppercase tracking-wider text-muted">
                Géneros (separados por coma)
              </span>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={draft.genreNames.join(", ")}
                onChange={(e) =>
                  patchDraft({
                    genreNames: e.target.value
                      .split(",")
                      .map((g) => g.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>

            <label className="block space-y-1 sm:col-span-2">
              <span className="text-[10px] uppercase tracking-wider text-muted">URL portada</span>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={draft.coverUrl ?? ""}
                onChange={(e) => patchDraft({ coverUrl: e.target.value || null })}
                placeholder="/covers/plataforma/archivo.jpg"
              />
            </label>

            <label className="block space-y-1 sm:col-span-2">
              <span className="text-[10px] uppercase tracking-wider text-muted">
                Subir portada al CDN
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-accent-fg"
                disabled={coverUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadCoverFile(file);
                  e.target.value = "";
                }}
              />
              <p className="text-xs text-muted">
                Se sube a{" "}
                <code className="text-[11px]">
                  /covers/{draft.platformSlug}/{draft.slug}.jpg
                </code>{" "}
                vía SFTP (COVERS_FTP_*).
              </p>
            </label>

            <label className="block space-y-1 sm:col-span-2">
              <span className="text-[10px] uppercase tracking-wider text-muted">Descripción</span>
              <textarea
                rows={6}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed"
                value={draft.description ?? ""}
                onChange={(e) => patchDraft({ description: e.target.value || null })}
              />
            </label>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={saving || aiRunning}
              onClick={() => void saveDraft()}
            >
              {saving ? "Guardando…" : "Guardar borrador"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={enriching || aiRunning}
              onClick={() => void enrichCover()}
            >
              {enriching ? "Buscando portada…" : "Portada (PriceCharting)"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-violet-400/40 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-800 dark:text-violet-200 disabled:opacity-50"
              disabled={aiRunning || saving}
              onClick={() => void runAiFill()}
            >
              {aiRunning ? "IA trabajando…" : "Rellenar con IA"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-800 dark:text-emerald-200 disabled:opacity-50"
              disabled={publishing || aiRunning}
              onClick={() => void publish()}
            >
              {publishing ? "Publicando…" : "Publicar al catálogo"}
            </button>
          </div>

          {message && <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}
          {error && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        </Panel>
      </div>

      <aside className="space-y-4">
        <Panel>
          <PanelTitle>Vista previa</PanelTitle>
          <div className="relative mx-auto aspect-[3/4] w-full max-w-[200px] overflow-hidden rounded-lg border border-border bg-card-hover">
            {draft.coverUrl ? (
              (() => {
                const src =
                  getCoverSrc(draft.coverUrl, draft.catalogId) ??
                  (draft.coverUrl.startsWith("http") ? draft.coverUrl : null);
                return src ? (
                  <Image
                    src={src}
                    alt={draft.title}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted">
                    Vista previa no disponible
                  </div>
                );
              })()
            ) : (
              <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted">
                Sin portada
              </div>
            )}
          </div>
          <p className="mt-3 text-center text-sm font-medium">{draft.title}</p>
          <p className="text-center text-xs text-muted">
            {draft.platformSlug} · {draft.region}
          </p>
          <Link
            href={`/catalogo/${draft.slug}-${draft.platformSlug}-${regionSlug}`}
            className="mt-3 block text-center text-xs text-accent hover:underline"
            target="_blank"
          >
            Ver URL prevista →
          </Link>
        </Panel>

        {(aiRunning || logs.length > 0) && (
          <Panel className="border-violet-400/20 bg-violet-500/5">
            <PanelTitle>Actividad IA</PanelTitle>
            <ul className="max-h-64 space-y-1 overflow-y-auto font-mono text-[11px] leading-relaxed">
              {logs.map((line) => (
                <li
                  key={line.id}
                  className={
                    line.tone === "err"
                      ? "text-rose-600 dark:text-rose-400"
                      : line.tone === "ok"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted"
                  }
                >
                  {line.text}
                </li>
              ))}
              {aiRunning && (
                <li className="animate-pulse text-violet-600 dark:text-violet-300">…</li>
              )}
            </ul>
          </Panel>
        )}
      </aside>
    </div>
  );
}
