"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ImportStats } from "@/lib/import-collection";
import type { CollectionSummary } from "@/lib/collection-store";
import { Panel, PanelTitle } from "@/components/ui";

type Props = {
  hasItems: boolean;
  canViewCollectionValue: boolean;
};

export function CollectionImport({ hasItems, canViewCollectionValue }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ stats: ImportStats; summary: CollectionSummary } | null>(
    null,
  );

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/user/collection/import", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al importar.");
        return;
      }
      setResult({ stats: data.stats, summary: data.summary });
      router.refresh();
    } catch {
      setError("No se pudo subir el archivo.");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Panel className="mb-8">
      <PanelTitle>
        {hasItems ? "Actualizar colección" : "Importar colección"}
      </PanelTitle>
      <p className="mt-2 text-sm text-muted">
        Sube un Excel (.xlsx) o CSV con tus juegos. Compatible con exportaciones de{" "}
        <strong className="font-medium text-foreground">PriceCharting</strong> (
        <code className="text-xs">product-name</code>, <code className="text-xs">console-name</code>
        , precios loose/CIB/new…) y plantillas propias con columnas{" "}
        <strong className="font-medium text-foreground">Título</strong> y{" "}
        <strong className="font-medium text-foreground">Plataforma</strong>.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="btn-primary cursor-pointer">
          {loading ? "Importando…" : hasItems ? "Reimportar archivo" : "Elegir archivo"}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            disabled={loading}
            onChange={onFileChange}
          />
        </label>
        {hasItems && (
          <p className="text-xs text-muted">
            La importación reemplaza tu colección actual por completo.
          </p>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
          Importados {result.stats.imported} juegos · {result.stats.matchedCatalog} enlazados al
          catálogo
          {result.stats.unmatched > 0 &&
            ` · ${result.stats.unmatched} pendientes de ficha (ver lista abajo)`}
          .
          {canViewCollectionValue && (
            <>
              {" "}
              Valor venta ES:{" "}
              {new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(
                result.summary.totalRecommendedValue,
              )}
            </>
          )}
        </div>
      )}
    </Panel>
  );
}
