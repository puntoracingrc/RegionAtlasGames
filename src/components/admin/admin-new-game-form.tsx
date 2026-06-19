"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { adminToneClass } from "@/components/admin/admin-visual";
import { Panel, PanelTitle } from "@/components/ui";
import {
  AdminSimilarGamesPanel,
  type SimilarCatalogMatchView,
} from "@/components/admin/admin-similar-games-panel";

type PlatformOption = { slug: string; name: string };

type Props = {
  platforms: PlatformOption[];
  regions: readonly string[];
  createApiUrl?: string;
  similarApiUrl?: string;
  redirectBase?: string;
  contributorMode?: boolean;
};

type CreatePayload = {
  title: string;
  platformSlug: string;
  region: string;
  reference?: string;
  slug?: string;
  autoEnrich: boolean;
  autoAi: boolean;
  confirmDistinct?: boolean;
};

export function AdminNewGameForm({
  platforms,
  regions,
  createApiUrl = "/api/admin/games",
  similarApiUrl = "/api/admin/games/similar",
  redirectBase = "/admin/cola",
  contributorMode = false,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [platformSlug, setPlatformSlug] = useState(platforms[0]?.slug ?? "snes");
  const [region, setRegion] = useState(regions[0] ?? "PAL España");
  const [reference, setReference] = useState("");
  const [slug, setSlug] = useState("");
  const [autoAi, setAutoAi] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [similarMatches, setSimilarMatches] = useState<SimilarCatalogMatchView[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showSimilarGate, setShowSimilarGate] = useState(false);

  const platformLabel = useMemo(
    () => platforms.find((p) => p.slug === platformSlug)?.name ?? platformSlug,
    [platforms, platformSlug],
  );

  useEffect(() => {
    if (showSimilarGate || title.trim().length < 3) {
      if (title.trim().length < 3) setSimilarMatches([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const params = new URLSearchParams({
          title: title.trim(),
          platformSlug,
          region,
        });
        if (slug.trim()) params.set("slug", slug.trim());
        const res = await fetch(`${similarApiUrl}?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { matches?: SimilarCatalogMatchView[] };
        setSimilarMatches(data.matches ?? []);
      } catch {
        /* ignore abort / network */
      } finally {
        setPreviewLoading(false);
      }
    }, 450);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [title, platformSlug, region, slug, showSimilarGate]);

  async function createGame(payload: CreatePayload) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(createApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.status === 409 && data.error === "similar_games" && Array.isArray(data.matches)) {
        setSimilarMatches(data.matches as SimilarCatalogMatchView[]);
        setShowSimilarGate(true);
        return;
      }

      if (!res.ok) {
        setError(data.error ?? "No se pudo crear el borrador.");
        return;
      }

      setShowSimilarGate(false);
      setSimilarMatches([]);
      router.push(data.redirect ?? `${redirectBase}/${data.pcId}`);
    } catch {
      setError("Error de red.");
    } finally {
      setLoading(false);
    }
  }

  function buildPayload(confirmDistinct = false): CreatePayload {
    return {
      title,
      platformSlug,
      region,
      reference: reference || undefined,
      slug: slug || undefined,
      autoEnrich: !contributorMode,
      autoAi: contributorMode ? false : autoAi,
      confirmDistinct,
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (similarMatches.length > 0 && !showSimilarGate) {
      setShowSimilarGate(true);
      return;
    }
    if (showSimilarGate) return;
    await createGame(buildPayload(false));
  }

  async function onConfirmDistinct() {
    await createGame(buildPayload(true));
  }

  function onCancelSimilar() {
    setShowSimilarGate(false);
    setSimilarMatches([]);
  }

  const gateActive = showSimilarGate && similarMatches.length > 0;

  return (
    <Panel className={adminToneClass("edit")}>
      <PanelTitle eyebrow="Alta manual">
        {contributorMode ? "Nueva ficha para revisión" : "Nuevo juego manual"}
      </PanelTitle>
      <p className="mb-5 max-w-3xl text-sm leading-6 text-muted">
        {contributorMode
          ? "Crea una ficha nueva. Solo puedes enviarla a revisión; el administrador decidirá si publicarla."
          : "Crea una ficha desde cero. Al escribir el título verás si ya hay nombres parecidos en el catálogo. Al guardar se busca portada en PriceCharting y, si activas la opción, la IA rellenará metadatos y descripción en directo."}
      </p>

      <form
        onSubmit={onSubmit}
        className="grid max-w-3xl gap-4 rounded-2xl border border-border bg-background/45 p-4 md:grid-cols-2"
      >
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">Título</span>
          <input
            required
            className="input"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setShowSimilarGate(false);
            }}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">Plataforma</span>
          <select
            className="input"
            value={platformSlug}
            onChange={(e) => {
              setPlatformSlug(e.target.value);
              setShowSimilarGate(false);
            }}
          >
            {platforms.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">Región</span>
          <select
            className="input"
            value={region}
            onChange={(e) => {
              setRegion(e.target.value);
              setShowSimilarGate(false);
            }}
          >
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">
            Referencia SKU / CUSA (opcional)
          </span>
          <input
            className="input font-mono"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">Slug (opcional)</span>
          <input
            className="input font-mono text-xs"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setShowSimilarGate(false);
            }}
            placeholder="Se genera del título si lo dejas vacío"
          />
        </label>

        {!contributorMode && (
          <label className="flex items-center gap-3 rounded-xl border border-border bg-card/70 p-3 text-sm md:col-span-2">
            <input
              type="checkbox"
              checked={autoAi}
              onChange={(e) => setAutoAi(e.target.checked)}
            />
            <span>
              <span className="block font-medium text-foreground">Rellenar con IA al abrir el editor</span>
              <span className="text-xs text-muted">
                Útil para completar descripción, año, compañía y géneros tras crear la ficha.
              </span>
            </span>
          </label>
        )}

        {(gateActive ||
          previewLoading ||
          (similarMatches.length > 0 && title.trim().length >= 3 && !gateActive)) && (
          <AdminSimilarGamesPanel
            pendingTitle={title.trim()}
            pendingRegion={region}
            pendingPlatformLabel={platformLabel}
            matches={similarMatches}
            mode={gateActive ? "confirm" : "preview"}
            loading={previewLoading && !gateActive}
            confirmLoading={loading}
            onConfirmDistinct={gateActive ? () => void onConfirmDistinct() : undefined}
            onCancel={gateActive ? onCancelSimilar : undefined}
          />
        )}

        {!gateActive && (
          <div className="md:col-span-2">
            <button type="submit" className="btn-primary w-full sm:w-auto" disabled={loading || previewLoading}>
              {loading ? "Creando…" : contributorMode ? "Crear ficha" : "Crear y abrir editor"}
            </button>
          </div>
        )}

        {error && <p className="text-sm text-rose-600 dark:text-rose-400 md:col-span-2">{error}</p>}
      </form>
    </Panel>
  );
}
