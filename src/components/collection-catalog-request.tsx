"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Panel, PanelTitle } from "@/components/ui";

type Props = {
  totalItems: number;
  pendingCount: number;
  outOfScopeCount: number;
  lastSentAt: string | null;
  configured: boolean;
};

export function CollectionCatalogRequestPanel({
  totalItems,
  pendingCount,
  outOfScopeCount,
  lastSentAt,
  configured,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSend() {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/user/collection/catalog-request", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo enviar el listado.");
        return;
      }
      setSuccess(data.message ?? "Listado enviado.");
      router.refresh();
    } catch {
      setError("Error de red al enviar el listado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel className="mb-8 border-violet-400/20 bg-violet-500/5">
      <PanelTitle>Solicitar nuevas fichas de catálogo</PanelTitle>
      <p className="mt-2 max-w-3xl text-sm text-muted">
        Envía al equipo de {totalItems} juegos que aún no tienen ficha oficial (
        {pendingCount > 0 && `${pendingCount} retro pendientes`}
        {pendingCount > 0 && outOfScopeCount > 0 ? " · " : ""}
        {outOfScopeCount > 0 && `${outOfScopeCount} en PS5 u otras plataformas`}) para priorizarlos
        en futuras actualizaciones del catálogo.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={loading || !configured}
          onClick={onSend}
        >
          {loading ? "Enviando…" : "Enviar listado al desarrollador"}
        </button>
        {lastSentAt && (
          <p className="text-xs text-muted">
            Último envío: {new Date(lastSentAt).toLocaleString("es-ES")}
          </p>
        )}
      </div>

      {!configured && (
        <p className="mt-3 text-xs text-muted">
          El envío automático estará disponible en cuanto el administrador configure el email del
          equipo de catálogo.
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}

      {success && (
        <p className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
          {success}
        </p>
      )}
    </Panel>
  );
}
