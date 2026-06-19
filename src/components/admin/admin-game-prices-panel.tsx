"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminToneClass } from "@/components/admin/admin-visual";
import { Panel, PanelTitle } from "@/components/ui";
import type { AdminPriceFields } from "@/lib/admin-price-patch";

type Props = {
  catalogId: string;
  initialPrices: AdminPriceFields;
  updatedAt?: string | null;
};

type JobState = {
  jobId: string;
  status: "running" | "done" | "error";
  logTail?: string;
  error?: string;
};

function numValue(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function PriceInput({
  label,
  value,
  onChange,
  step = "0.01",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-wider text-muted">{label}</span>
      <input
        type="number"
        step={step}
        min="0"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
      />
    </label>
  );
}

export function AdminGamePricesPanel({ catalogId, initialPrices, updatedAt }: Props) {
  const [prices, setPrices] = useState(initialPrices);
  const [saving, setSaving] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [job, setJob] = useState<JobState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const patchPrice = useCallback((key: keyof AdminPriceFields, raw: string) => {
    setPrices((prev) => {
      const next = { ...prev };
      if (!raw.trim()) {
        if (key === "hasEsPrice" || key === "priceRegionVerified") {
          next[key] = false;
        } else {
          next[key] = null;
        }
        return next;
      }
      if (key === "hasEsPrice" || key === "priceRegionVerified") {
        next[key] = raw === "true";
        return next;
      }
      if (
        key === "priceSource" ||
        key === "priceDataSources" ||
        key.endsWith("Url")
      ) {
        (next as Record<string, unknown>)[key] = raw;
        return next;
      }
      const n = Number.parseFloat(raw.replace(",", "."));
      (next as Record<string, unknown>)[key] = Number.isFinite(n) ? n : null;
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current != null) window.clearInterval(pollRef.current);
    };
  }, []);

  async function savePrices() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/catalog/${encodeURIComponent(catalogId)}/prices`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prices),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudieron guardar los precios.");
        return;
      }
      setPrices(data.prices);
      setMessage("Precios guardados.");
    } catch {
      setError("Error de red al guardar precios.");
    } finally {
      setSaving(false);
    }
  }

  function pollJob(jobId: string) {
    if (pollRef.current != null) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/price-jobs/${encodeURIComponent(jobId)}`);
        const data = await res.json();
        if (!res.ok) return;
        const meta = data.job as JobState;
        setJob(meta);
        if (meta.status === "done") {
          setCollecting(false);
          setMessage("Recolección de precios terminada. Recarga para ver valores actualizados.");
          if (pollRef.current != null) window.clearInterval(pollRef.current);
          const priceRes = await fetch(`/api/admin/catalog/${encodeURIComponent(catalogId)}/prices`);
          const priceData = await priceRes.json();
          if (priceRes.ok) setPrices(priceData.prices);
        } else if (meta.status === "error") {
          setCollecting(false);
          setError(meta.error ?? "La recolección falló.");
          if (pollRef.current != null) window.clearInterval(pollRef.current);
        }
      } catch {
        /* ignore transient poll errors */
      }
    }, 3000);
  }

  async function collectPrices() {
    setCollecting(true);
    setError(null);
    setMessage(null);
    setJob(null);
    try {
      const res = await fetch(
        `/api/admin/catalog/${encodeURIComponent(catalogId)}/collect-prices`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo iniciar la recolección.");
        setCollecting(false);
        return;
      }
      setMessage("Recolección en curso (puede tardar varios minutos)…");
      setJob({ jobId: data.jobId, status: "running" });
      pollJob(data.jobId);
    } catch {
      setError("Error de red al iniciar recolección.");
      setCollecting(false);
    }
  }

  return (
    <Panel className={adminToneClass("status")}>
      <PanelTitle>Precios</PanelTitle>
      {updatedAt && (
        <p className="mb-4 text-xs text-muted">Última actualización catálogo: {updatedAt}</p>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted md:col-span-3">
          Mercado ES (P2P)
        </p>
        <PriceInput
          label="Recomendado"
          value={numValue(prices.recommendedPrice)}
          onChange={(v) => patchPrice("recommendedPrice", v)}
        />
        <PriceInput
          label="Suelto"
          value={numValue(prices.estimatedPriceLoose)}
          onChange={(v) => patchPrice("estimatedPriceLoose", v)}
        />
        <PriceInput
          label="Juego + manual"
          value={numValue(prices.estimatedPriceGameManual)}
          onChange={(v) => patchPrice("estimatedPriceGameManual", v)}
        />
        <PriceInput
          label="Completo"
          value={numValue(prices.estimatedPriceComplete)}
          onChange={(v) => patchPrice("estimatedPriceComplete", v)}
        />
        <PriceInput
          label="Precintado"
          value={numValue(prices.estimatedPriceSealed)}
          onChange={(v) => patchPrice("estimatedPriceSealed", v)}
        />
        <PriceInput
          label="Mínimo mercado"
          value={numValue(prices.marketMin)}
          onChange={(v) => patchPrice("marketMin", v)}
        />
        <PriceInput
          label="Máximo mercado"
          value={numValue(prices.marketMax)}
          onChange={(v) => patchPrice("marketMax", v)}
        />
        <PriceInput
          label="Ref. PriceCharting"
          value={numValue(prices.pcRefPrice)}
          onChange={(v) => patchPrice("pcRefPrice", v)}
        />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted md:col-span-3">
          Retail / referencias
        </p>
        <PriceInput
          label="CeX venta"
          value={numValue(prices.cexSellPrice)}
          onChange={(v) => patchPrice("cexSellPrice", v)}
        />
        <PriceInput
          label="CeX cash"
          value={numValue(prices.cexCashPrice)}
          onChange={(v) => patchPrice("cexCashPrice", v)}
        />
        <PriceInput
          label="Japan Game Online"
          value={numValue(prices.jgoRetailPrice)}
          onChange={(v) => patchPrice("jgoRetailPrice", v)}
        />
        <PriceInput
          label="Chollo Games"
          value={numValue(prices.cholloRetailPrice)}
          onChange={(v) => patchPrice("cholloRetailPrice", v)}
        />
        <PriceInput
          label="Kaoto Store"
          value={numValue(prices.kaotoRetailPrice)}
          onChange={(v) => patchPrice("kaotoRetailPrice", v)}
        />
        <PriceInput
          label="TodoColeccion"
          value={numValue(prices.tcListingPrice)}
          onChange={(v) => patchPrice("tcListingPrice", v)}
        />
        <PriceInput
          label="TodoConsolas"
          value={numValue(prices.tcnsRetailPrice)}
          onChange={(v) => patchPrice("tcnsRetailPrice", v)}
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={prices.hasEsPrice}
            onChange={(e) => patchPrice("hasEsPrice", e.target.checked ? "true" : "false")}
          />
          Tiene precio ES
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={prices.priceRegionVerified ?? false}
            onChange={(e) =>
              patchPrice("priceRegionVerified", e.target.checked ? "true" : "false")
            }
          />
          Región verificada
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={saving} onClick={() => void savePrices()}>
          {saving ? "Guardando…" : "Guardar precios"}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={collecting}
          onClick={() => void collectPrices()}
        >
          {collecting ? "Recolectando…" : "Recolectar precios (todas las fuentes)"}
        </button>
      </div>

      {job?.logTail && (
        <pre className="mt-4 max-h-48 overflow-auto rounded-lg border border-border bg-background/80 p-3 text-[11px] leading-relaxed text-muted">
          {job.logTail.slice(-2000)}
        </pre>
      )}

      {message && <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}
      {error && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      <p className="mt-4 text-xs text-muted">
        La recolección lanza los collectors configurados para la plataforma (Wallapop, Vinted, retail,
        etc.) solo para este juego y sincroniza el catálogo local. Requiere entorno de desarrollo con
        Python y acceso a red.
      </p>
    </Panel>
  );
}
