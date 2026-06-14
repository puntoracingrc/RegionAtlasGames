"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Panel, PanelTitle } from "@/components/ui";
import {
  AdminSimilarGamesPanel,
  type SimilarCatalogMatchView,
} from "@/components/admin/admin-similar-games-panel";

type PlatformOption = { slug: string; name: string };

type Props = {
  platforms: PlatformOption[];
  regions: readonly string[];
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

export function AdminNewGameForm({ platforms, regions }: Props) {
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
        const res = await fetch(`/api/admin/games/similar?${params}`, {
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
      const res = await fetch("/api/admin/games", {
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
      router.push(data.redirect ?? `/admin/cola/${data.pcId}`);
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
      autoEnrich: true,
      autoAi,
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
    <Panel>
      <PanelTitle>Nuevo juego manual</PanelTitle>
      <p className="mb-4 text-sm text-muted">
        Crea una ficha desde cero. Al escribir el título verás si ya hay nombres parecidos en el
        catálogo. Al guardar se busca portada en PriceCharting y, si activas la opción, la IA
        rellenará metadatos y descripción en directo.
      </p>

      <form onSubmit={onSubmit} className="grid max-w-2xl gap-4">
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">Título</span>
          <input
            required
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
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
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
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
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
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
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">Slug (opcional)</span>
          <input
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-xs"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setShowSimilarGate(false);
            }}
            placeholder="Se genera del título si lo dejas vacío"
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoAi}
            onChange={(e) => setAutoAi(e.target.checked)}
          />
          Rellenar con IA al abrir el editor
        </label>

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
          <button type="submit" className="btn-primary w-fit" disabled={loading || previewLoading}>
            {loading ? "Creando…" : "Crear y abrir editor"}
          </button>
        )}

        {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      </form>
    </Panel>
  );
}
