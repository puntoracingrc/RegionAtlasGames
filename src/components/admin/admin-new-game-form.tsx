"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Panel, PanelTitle } from "@/components/ui";

type PlatformOption = { slug: string; name: string };

type Props = {
  platforms: PlatformOption[];
  regions: readonly string[];
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          platformSlug,
          region,
          reference: reference || undefined,
          slug: slug || undefined,
          autoEnrich: true,
          autoAi,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo crear el borrador.");
        return;
      }
      router.push(data.redirect ?? `/admin/cola/${data.pcId}`);
    } catch {
      setError("Error de red.");
    } finally {
      setLoading(false);
    }
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

        <button type="submit" className="btn-primary w-fit" disabled={loading}>
          {loading ? "Creando…" : "Crear y abrir editor"}
        </button>

        {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      </form>
    </Panel>
  );
}
