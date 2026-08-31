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
  autoApplied?: boolean;
  autoApplySummary?: string;
  autoApplyError?: string;
};

function numValue(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function formatAdminPrice(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function sourceTextIncludes(prices: AdminPriceFields, needle: string): boolean {
  const text = `${prices.priceSource ?? ""} ${prices.priceDataSources ?? ""}`.toLowerCase();
  return text.includes(needle.toLowerCase());
}

type PriceSourceRow = {
  label: string;
  role: string;
  status: "active" | "empty";
  value?: string;
  href?: string | null;
};

function priceSourceRows(prices: AdminPriceFields): PriceSourceRow[] {
  const recommendedRange =
    prices.marketMin != null || prices.marketMax != null
      ? `${formatAdminPrice(prices.marketMin)} – ${formatAdminPrice(prices.marketMax)}`
      : formatAdminPrice(prices.recommendedPrice);
  const p2pValue = prices.recommendedPrice != null ? `Incluido en recomendado · ${recommendedRange}` : undefined;
  return [
    {
      label: "Wallapop ES",
      role: "P2P agregado",
      status: sourceTextIncludes(prices, "Wallapop") ? "active" : "empty",
      value: p2pValue,
    },
    {
      label: "eBay ES",
      role: "API directa / afiliación",
      status: sourceTextIncludes(prices, "eBay") ? "active" : "empty",
      value: p2pValue,
    },
    {
      label: "Vinted ES",
      role: "P2P agregado",
      status: sourceTextIncludes(prices, "Vinted") ? "active" : "empty",
      value: p2pValue,
    },
    {
      label: "TodoColeccion",
      role: "P2P / referencia",
      status: prices.tcListingPrice != null || sourceTextIncludes(prices, "TodoColeccion") ? "active" : "empty",
      value: prices.tcListingPrice != null ? formatAdminPrice(prices.tcListingPrice) : p2pValue,
      href: prices.tcProductUrl,
    },
    {
      label: "PriceCharting",
      role: "Referencia internacional",
      status: prices.pcRefPrice != null ? "active" : "empty",
      value: formatAdminPrice(prices.pcRefPrice),
    },
    {
      label: "CeX",
      role: "Retail segunda mano",
      status: prices.cexSellPrice != null || prices.cexCashPrice != null ? "active" : "empty",
      value:
        prices.cexSellPrice != null || prices.cexCashPrice != null
          ? `Venta ${formatAdminPrice(prices.cexSellPrice)} · Cash ${formatAdminPrice(prices.cexCashPrice)}`
          : undefined,
      href: prices.cexProductUrl,
    },
    {
      label: "Japan Game Online",
      role: "Retail import/Japón",
      status: prices.jgoRetailPrice != null ? "active" : "empty",
      value: formatAdminPrice(prices.jgoRetailPrice),
      href: prices.jgoProductUrl,
    },
    {
      label: "Chollo Games",
      role: "Retail",
      status: prices.cholloRetailPrice != null ? "active" : "empty",
      value: formatAdminPrice(prices.cholloRetailPrice),
      href: prices.cholloProductUrl,
    },
    {
      label: "Kaoto Store",
      role: "Retail",
      status: prices.kaotoRetailPrice != null ? "active" : "empty",
      value: formatAdminPrice(prices.kaotoRetailPrice),
      href: prices.kaotoProductUrl,
    },
    {
      label: "TodoConsolas",
      role: "Retail segunda mano",
      status: prices.tcnsRetailPrice != null ? "active" : "empty",
      value: formatAdminPrice(prices.tcnsRetailPrice),
      href: prices.tcnsProductUrl,
    },
  ];
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

function PriceSourcesMap({ prices }: { prices: AdminPriceFields }) {
  const rows = priceSourceRows(prices);
  const activeCount = rows.filter((row) => row.status === "active").length;
  return (
    <div className="mb-6 rounded-2xl border border-border bg-background/45 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">Mapa de fuentes</p>
          <p className="mt-1 text-sm text-muted">
            {activeCount} fuentes con dato. eBay entra por API directa; el resto por recolectores y retail configurado.
          </p>
        </div>
        {(prices.priceSource || prices.priceDataSources) && (
          <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted">
            {prices.priceDataSources || prices.priceSource}
          </span>
        )}
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className={`rounded-xl border p-3 ${
              row.status === "active"
                ? "border-emerald-400/30 bg-emerald-500/10"
                : "border-border bg-background/60"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-foreground">{row.label}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wider text-muted">{row.role}</p>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                  row.status === "active"
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "bg-muted/10 text-muted"
                }`}
              >
                {row.status === "active" ? "con dato" : "sin dato"}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted">{row.value ?? "No ha aportado precio para esta ficha."}</p>
            {row.href ? (
              <a
                href={row.href}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-xs font-semibold text-accent"
              >
                Abrir fuente →
              </a>
            ) : null}
          </div>
        ))}
      </div>
    </div>
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
          setMessage(
            meta.autoApplied
              ? `Recolección terminada y precios aplicados automáticamente (${meta.autoApplySummary}).`
              : "Recolección de precios terminada. Revisa si hay valores nuevos.",
          );
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
          label="Nuevo en tienda"
          value={numValue(prices.estimatedPriceNewRetail)}
          onChange={(v) => patchPrice("estimatedPriceNewRetail", v)}
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

      <PriceSourcesMap prices={prices} />

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
        La recolección lanza los collectors configurados para la plataforma. eBay queda fuera de la rueda:
        sus precios entran por API directa/afiliación cuando estén disponibles.
      </p>
    </Panel>
  );
}
