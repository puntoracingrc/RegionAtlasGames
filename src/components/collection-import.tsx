"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileUp, LoaderCircle } from "lucide-react";
import type { ImportStats } from "@/lib/import-collection";
import type { CollectionSummary } from "@/lib/collection-store";
import { Panel, PanelTitle } from "@/components/ui";
import { CollectionImportRace } from "@/components/collection-import-race";

type Props = {
  hasItems: boolean;
  canViewCollectionValue: boolean;
  compact?: boolean;
};

export function CollectionImport({ hasItems, canViewCollectionValue, compact = false }: Props) {
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

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept=".xlsx,.csv"
      className="hidden"
      disabled={loading}
      onChange={onFileChange}
    />
  );

  if (compact) {
    return (
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <label
          className="btn-secondary min-h-9 cursor-pointer gap-2 px-3 py-2 text-xs"
          title={hasItems ? "Reemplaza la colección actual con un Excel o CSV" : "Importa un Excel o CSV"}
        >
          {loading ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <FileUp className="h-4 w-4" aria-hidden />
          )}
          {loading ? "Importando…" : hasItems ? "Reimportar" : "Importar archivo"}
          {fileInput}
        </label>
        {error && (
          <p className="max-w-sm text-xs text-rose-700 dark:text-rose-300" role="alert">
            {error}
          </p>
        )}
        {result && (
          <p className="max-w-sm text-xs text-emerald-700 dark:text-emerald-300" role="status">
            {result.stats.imported} juegos importados · {result.stats.matchedCatalog} enlazados
          </p>
        )}
      </div>
    );
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
          {fileInput}
        </label>
        {hasItems && (
          <p className="text-xs text-muted">
            La importación reemplaza tu colección actual por completo.
          </p>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-200">
          {error}
        </p>
      )}

      {result && (
        <>
          <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-100">
            Importados {result.stats.imported} juegos · {result.stats.matchedCatalog} enlazados al
            catálogo
            {result.stats.unmatched > 0 &&
              ` · ${result.stats.unmatched} pendientes de ficha`}
            .
            {result.summary.outOfScopeItems > 0 &&
              ` ${result.summary.outOfScopeItems} en plataformas aún sin ficha pública completa.`}
            {canViewCollectionValue && (
              <>
                {" "}
                Valor venta:{" "}
                {new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(
                  result.summary.totalRecommendedValue,
                )}
              </>
            )}
          </div>
          <CollectionImportRace stats={result.stats} />
        </>
      )}
    </Panel>
  );
}
