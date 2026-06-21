"use client";

import { useState } from "react";
import type { PriceReviewCondition, PriceReviewItem } from "@/lib/admin-price-review";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import { adminToneClass } from "./admin-visual";

type Props = {
  initialItems: PriceReviewItem[];
};

const conditionLabels: Record<string, string> = {
  loose: "Suelto/cartucho/CD",
  game_manual: "Juego + manual",
  complete: "Completo",
  sealed: "Precintado",
  unknown: "Desconocido",
};

const commonRegionOptions = [
  "PAL España",
  "España",
  "PAL Europa",
  "PAL UK/ENG",
  "PAL Alemania",
  "USA",
  "Japón",
  "Asia",
  "Australia",
];

function uniqueOptions(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const clean = value?.trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(new Date(value));
}

function formatPrice(value: number | string | null | undefined): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(num);
}

function sourceLabel(value: string): string {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function reasonLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ReviewCard({
  item,
  onDone,
}: {
  item: PriceReviewItem;
  onDone: (id: string) => void;
}) {
  const [catalogId, setCatalogId] = useState(item.catalogId ?? item.candidateCatalogId ?? "");
  const [region, setRegion] = useState(item.targetRegion ?? item.detectedRegion ?? "");
  const [condition, setCondition] = useState<PriceReviewCondition>((item.condition as PriceReviewCondition) || "unknown");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  const alternatives = item.evidence?.matchAlternatives ?? [];
  const imageUrl = item.evidence?.imageUrl || item.evidence?.imageUrls?.[0] || null;
  const regionOptions = uniqueOptions([
    item.targetRegion,
    item.detectedRegion,
    ...alternatives.map((alt) => alt.region),
    ...commonRegionOptions,
    region,
  ]);

  async function decide(action: "accept" | "reject") {
    setState("saving");
    setMessage("");
    const response = await fetch(`/api/admin/price-reviews/${encodeURIComponent(item.id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, catalogId, region, condition, note }),
    });
    const data = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) {
      setState("error");
      setMessage(data?.error ?? "No se pudo guardar la decisión.");
      return;
    }
    onDone(item.id);
  }

  return (
    <article className="rounded-2xl border border-border bg-background/55 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{sourceLabel(item.source)}</Badge>
            <Badge tone="amber">{reasonLabel(item.reason)}</Badge>
          </div>
          <h3 className="mt-2 text-base font-black text-foreground">{item.listingTitle}</h3>
          <p className="mt-1 text-xs text-muted">
            {item.platformSlug} · objetivo {item.targetRegion || "—"} · detectada {item.detectedRegion || "—"} · {formatDate(item.collectedAt)}
          </p>
        </div>
        <p className="text-xl font-black text-foreground">{formatPrice(item.priceEur)}</p>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[120px_1fr]">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="h-28 w-28 rounded-xl border border-border object-cover" />
        ) : (
          <div className="flex h-28 w-28 items-center justify-center rounded-xl border border-border bg-card/50 text-[11px] text-muted">
            Sin imagen
          </div>
        )}
        <div className="grid gap-2 text-xs text-muted md:grid-cols-2">
          <p><strong className="text-foreground">Juego candidato:</strong> {item.candidateCatalogId || item.catalogId || "—"}</p>
          <p><strong className="text-foreground">Estado sugerido:</strong> {conditionLabels[String(item.condition || "unknown")] ?? item.condition}</p>
          <p><strong className="text-foreground">Match:</strong> {item.evidence?.matchMethod || "—"} {item.evidence?.matchScore != null ? `· score ${item.evidence.matchScore}` : ""}</p>
          <p><strong className="text-foreground">IA:</strong> {item.evidence?.aiConfidence != null ? `confianza ${item.evidence.aiConfidence}` : "no usada / sin dato"}</p>
          <p className="md:col-span-2">
            <strong className="text-foreground">Evidencia región:</strong>{" "}
            {(item.evidence?.regionEvidence ?? []).join(", ") || "sin prueba"}
          </p>
          {item.evidence?.reviewNotes?.length ? (
            <p className="md:col-span-2"><strong className="text-foreground">Mini log:</strong> {item.evidence.reviewNotes.join(" · ")}</p>
          ) : null}
          {item.evidence?.url ? (
            <a href={item.evidence.url} target="_blank" rel="noreferrer" className="font-semibold text-accent md:col-span-2">
              Abrir anuncio/producto externo →
            </a>
          ) : null}
        </div>
      </div>

      {alternatives.length > 0 ? (
        <div className="mt-3 rounded-xl border border-border bg-card/45 p-3 text-xs text-muted">
          <p className="font-semibold text-foreground">Alternativas detectadas</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {alternatives.slice(0, 5).map((alt) => (
              <button
                key={`${alt.catalogId}-${alt.region}`}
                type="button"
                onClick={() => setCatalogId(alt.catalogId ?? catalogId)}
                className="rounded-full border border-border px-3 py-1 text-left font-semibold text-muted hover:border-accent hover:text-foreground"
              >
                {alt.catalogId} · {alt.region} · {alt.score}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <label className="text-xs font-semibold text-muted">
          Juego destino
          <input value={catalogId} onChange={(event) => setCatalogId(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-accent" />
        </label>
        <label className="text-xs font-semibold text-muted">
          Región
          <select value={region} onChange={(event) => setRegion(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-accent">
            <option value="">Selecciona región</option>
            {regionOptions.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-muted">
          Estado
          <select value={condition} onChange={(event) => setCondition(event.target.value as PriceReviewCondition)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-accent">
            {Object.entries(conditionLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-muted">
          Nota
          <input value={note} onChange={(event) => setNote(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-accent" />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={state === "saving"} onClick={() => decide("accept")} className="btn-primary text-xs">
          Aceptar verificado
        </button>
        <button type="button" disabled={state === "saving"} onClick={() => decide("reject")} className="btn-secondary text-xs">
          Rechazar
        </button>
        {state === "error" ? <span className="text-xs font-semibold text-rose-600 dark:text-rose-300">{message}</span> : null}
      </div>
    </article>
  );
}

export function AdminPriceReviewPanel({ initialItems }: Props) {
  const [items, setItems] = useState(initialItems);
  return (
    <Panel className={adminToneClass("edit")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <PanelTitle eyebrow="Precios a revisar">Anuncios pendientes de revisión</PanelTitle>
          <p className="mt-2 text-sm leading-6 text-muted">
            Esta cola es solo de precios recolectados. No se mezcla con la revisión de fichas del catálogo.
          </p>
        </div>
        <Badge tone={items.length > 0 ? "amber" : "green"}>{items.length} pendientes</Badge>
      </div>
      {items.length > 0 ? (
        <div className="mt-4 grid gap-3">
          {items.map((item) => (
            <ReviewCard key={item.id} item={item} onDone={(id) => setItems((current) => current.filter((entry) => entry.id !== id))} />
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-border bg-background/45 p-3 text-sm text-muted">
          No hay precios pendientes de revisión. Cuando un collector marque región, match o estado como dudoso aparecerá aquí.
        </p>
      )}
    </Panel>
  );
}
