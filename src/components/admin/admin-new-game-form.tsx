"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Panel, PanelTitle } from "@/components/ui";

type PlatformOption = { slug: string; name: string };

type SimilarMatch = {
  catalogId: string;
  title: string;
  region: string;
  slug: string;
  similarity: number;
  catalogUrl: string;
};

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
  const [similarMatches, setSimilarMatches] = useState<SimilarMatch[] | null>(null);
  const [similarMessage, setSimilarMessage] = useState<string | null>(null);

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
        setSimilarMatches(data.matches as SimilarMatch[]);
        setSimilarMessage(
          data.message ??
            "Hay juegos con un nombre muy parecido. ¿Es el mismo título o uno nuevo?",
        );
        return;
      }

      if (!res.ok) {
        setSimilarMatches(null);
        setSimilarMessage(null);
        setError(data.error ?? "No se pudo crear el borrador.");
        return;
      }

      setSimilarMatches(null);
      setSimilarMessage(null);
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
    setSimilarMatches(null);
    setSimilarMessage(null);
    await createGame(buildPayload(false));
  }

  async function onConfirmDistinct() {
    await createGame(buildPayload(true));
  }

  return (
    <Panel>
      <PanelTitle>Nuevo juego manual</PanelTitle>
      <p className="mb-4 text-sm text-muted">
        Crea una ficha desde cero. Al guardar se busca portada en PriceCharting y, si activas la
        opción, la IA rellenará metadatos y descripción en directo.
      </p>

      <form onSubmit={onSubmit} className="grid max-w-xl gap-4">
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">Título</span>
          <input
            required
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">Plataforma</span>
          <select
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={platformSlug}
            onChange={(e) => setPlatformSlug(e.target.value)}
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
            onChange={(e) => setRegion(e.target.value)}
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
            onChange={(e) => setSlug(e.target.value)}
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

        {similarMatches && similarMatches.length > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              {similarMessage ?? "Nombre muy parecido detectado"}
            </p>
            <ul className="mt-3 space-y-2">
              {similarMatches.map((match) => (
                <li
                  key={match.catalogId}
                  className="rounded-md border border-border/60 bg-background/80 px-3 py-2"
                >
                  <div className="font-medium">{match.title}</div>
                  <div className="text-xs text-muted">
                    {match.region} · {match.catalogId} · coincidencia{" "}
                    {Math.round(match.similarity * 100)}%
                  </div>
                  <Link
                    href={match.catalogUrl}
                    className="mt-1 inline-block text-xs text-accent hover:underline"
                    target="_blank"
                  >
                    Ver ficha existente
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={loading}
                onClick={() => void onConfirmDistinct()}
              >
                Es otro juego distinto — crear igualmente
              </button>
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/20"
                onClick={() => {
                  setSimilarMatches(null);
                  setSimilarMessage(null);
                }}
              >
                Cancelar y revisar título
              </button>
            </div>
          </div>
        )}

        <button type="submit" className="btn-primary w-fit" disabled={loading}>
          {loading ? "Creando…" : "Crear y abrir editor"}
        </button>

        {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      </form>
    </Panel>
  );
}
