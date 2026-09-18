"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Panel, PanelTitle } from "@/components/ui";
import { adminToneClass } from "@/components/admin/admin-visual";

type PlatformOption = { slug: string; name: string };
type MarketOption = {
  value: string;
  label: string;
  shortLabel: string;
  flagCode: string;
  group: string;
  broadRegion: string;
};
type VariantGroup = {
  id: number;
  label: string;
  markets: string[];
  barcode: string;
  productCodes: string;
  packagingLanguages: string;
  confidence: "CONFIRMED" | "PENDING_IDENTIFIER";
};

const MARKET_GROUP_LABELS: Record<string, string> = {
  europe: "Europa",
  america: "América",
  asia: "Asia",
  oceania: "Oceanía",
  "middle-east": "Oriente Medio",
  africa: "África",
};

function emptyGroup(id: number): VariantGroup {
  return {
    id,
    label: "",
    markets: [],
    barcode: "",
    productCodes: "",
    packagingLanguages: "",
    confidence: "PENDING_IDENTIFIER",
  };
}

function splitValues(value: string): string[] {
  return value.split(/[,;/]/).map((item) => item.trim()).filter(Boolean);
}

export function AdminRegionalVariantBatchForm({
  platforms,
  marketOptions,
}: {
  platforms: PlatformOption[];
  marketOptions: MarketOption[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [platformSlug, setPlatformSlug] = useState(
    platforms.find((platform) => platform.slug === "ps5")?.slug ?? platforms[0]?.slug ?? "ps5",
  );
  const [physicalVariant, setPhysicalVariant] = useState("Standard");
  const [baseSlug, setBaseSlug] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [year, setYear] = useState("");
  const [support, setSupport] = useState("");
  const [groups, setGroups] = useState<VariantGroup[]>([emptyGroup(1)]);
  const [nextId, setNextId] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ physicalVariantCount: number; regionalRecordCount: number } | null>(null);

  const marketsByGroup = useMemo(() => {
    const entries = new Map<string, MarketOption[]>();
    for (const option of marketOptions) {
      entries.set(option.group, [...(entries.get(option.group) ?? []), option]);
    }
    return [...entries.entries()];
  }, [marketOptions]);

  const selectedMarkets = useMemo(
    () => new Set(groups.flatMap((group) => group.markets)),
    [groups],
  );
  const regionalRecordCount = groups.reduce((total, group) => total + group.markets.length, 0);

  function updateGroup(id: number, patch: Partial<VariantGroup>) {
    setGroups((current) => current.map((group) => group.id === id ? { ...group, ...patch } : group));
  }

  function toggleMarket(group: VariantGroup, value: string) {
    const active = group.markets.includes(value);
    updateGroup(group.id, {
      markets: active ? group.markets.filter((market) => market !== value) : [...group.markets, value],
    });
  }

  function addGroup() {
    setGroups((current) => [...current, emptyGroup(nextId)]);
    setNextId((current) => current + 1);
  }

  async function submit(publishNow: boolean) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/admin/games/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          platformSlug,
          physicalVariant,
          baseSlug: baseSlug || undefined,
          coverUrl: coverUrl || null,
          year: year || null,
          support: support || null,
          publishNow,
          groups: groups.map((group) => ({
            label: group.label || undefined,
            markets: group.markets,
            barcode: group.barcode || null,
            productCodes: splitValues(group.productCodes),
            packagingLanguages: splitValues(group.packagingLanguages),
            confidence: group.confidence,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "No se pudo crear el lote.");
        return;
      }
      setResult({
        physicalVariantCount: data.physicalVariantCount,
        regionalRecordCount: data.regionalRecordCount,
      });
      if (!publishNow && data.redirect) router.push(data.redirect);
    } catch {
      setError("Error de red al guardar el lote.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel className={adminToneClass("edit")}>
      <PanelTitle eyebrow="Alta regional V2">Juego y variantes físicas</PanelTitle>
      <p className="mb-5 max-w-4xl text-sm leading-6 text-muted">
        Cada bloque representa una caja física. Selecciona uno o varios mercados dentro del bloque;
        el sistema creará una ficha regional por mercado y las mantendrá agrupadas como una sola edición física en V2.
      </p>

      <div className="grid gap-4 rounded-lg border border-border bg-background/45 p-4 md:grid-cols-2 lg:grid-cols-4">
        <label className="block space-y-1 lg:col-span-2">
          <span className="text-[10px] uppercase tracking-wider text-muted">Título</span>
          <input required className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">Plataforma</span>
          <select className="input" value={platformSlug} onChange={(event) => setPlatformSlug(event.target.value)}>
            {platforms.map((platform) => <option key={platform.slug} value={platform.slug}>{platform.name}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">Edición física</span>
          <input
            className="input"
            list="regional-physical-editions"
            value={physicalVariant}
            onChange={(event) => setPhysicalVariant(event.target.value)}
          />
          <datalist id="regional-physical-editions">
            {[
              "Standard",
              "Special Edition",
              "Collector's Edition",
              "Deluxe Edition",
              "Gold Edition",
              "Limited Edition",
              "Steelbook Edition",
              "Compilation",
              "Budget Reissue",
            ].map((edition) => <option key={edition} value={edition} />)}
          </datalist>
        </label>
        <label className="block space-y-1 lg:col-span-2">
          <span className="text-[10px] uppercase tracking-wider text-muted">Portada común (opcional)</span>
          <input className="input" value={coverUrl} onChange={(event) => setCoverUrl(event.target.value)} placeholder="https://…" />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">Slug base (opcional)</span>
          <input className="input" value={baseSlug} onChange={(event) => setBaseSlug(event.target.value)} placeholder="mortal-shell-ii" />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">Año</span>
          <input className="input" inputMode="numeric" value={year} onChange={(event) => setYear(event.target.value)} />
        </label>
        <label className="block space-y-1 lg:col-span-2">
          <span className="text-[10px] uppercase tracking-wider text-muted">Soporte</span>
          <input className="input" value={support} onChange={(event) => setSupport(event.target.value)} placeholder="Disco Blu-ray" />
        </label>
      </div>

      <div className="mt-5 space-y-4">
        {groups.map((group, groupIndex) => (
          <section key={group.id} className="rounded-lg border border-border bg-background/55 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Caja física {groupIndex + 1}</h2>
              {groups.length > 1 ? (
                <button
                  type="button"
                  className="icon-btn"
                  title="Eliminar caja física"
                  onClick={() => setGroups((current) => current.filter((item) => item.id !== group.id))}
                >
                  <Trash2 size={18} aria-hidden="true" />
                  <span className="sr-only">Eliminar caja física</span>
                </button>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted">Nombre del grupo</span>
                <input className="input" value={group.label} onChange={(event) => updateGroup(group.id, { label: event.target.value })} placeholder="US/CA" />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted">EAN / UPC / JAN</span>
                <input
                  className="input"
                  value={group.barcode}
                  onChange={(event) => updateGroup(group.id, {
                    barcode: event.target.value,
                    confidence: event.target.value.trim() ? "CONFIRMED" : "PENDING_IDENTIFIER",
                  })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted">Códigos de producto</span>
                <input className="input" value={group.productCodes} onChange={(event) => updateGroup(group.id, { productCodes: event.target.value })} placeholder="ELJM-31010" />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted">Idiomas de caja</span>
                <input className="input" value={group.packagingLanguages} onChange={(event) => updateGroup(group.id, { packagingLanguages: event.target.value })} placeholder="ES, FR, IT" />
              </label>
            </div>

            <label className="mt-3 block max-w-xs space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Estado de identificación</span>
              <select className="input" value={group.confidence} onChange={(event) => updateGroup(group.id, { confidence: event.target.value as VariantGroup["confidence"] })}>
                <option value="CONFIRMED">Variante confirmada</option>
                <option value="PENDING_IDENTIFIER">Confirmada, identificador pendiente</option>
              </select>
            </label>

            <div className="mt-4 space-y-3">
              {marketsByGroup.map(([marketGroup, options]) => (
                <fieldset key={marketGroup}>
                  <legend className="mb-2 text-xs font-semibold text-muted">{MARKET_GROUP_LABELS[marketGroup] ?? marketGroup}</legend>
                  <div className="flex flex-wrap gap-2">
                    {options.map((option) => {
                      const active = group.markets.includes(option.value);
                      const usedElsewhere = !active && selectedMarkets.has(option.value);
                      return (
                        <label
                          key={option.value}
                          className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${active ? "border-accent bg-accent/10 text-foreground" : "border-border bg-background text-muted"} ${usedElsewhere ? "cursor-not-allowed opacity-40" : ""}`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={active}
                            disabled={usedElsewhere}
                            onChange={() => toggleMarket(group, option.value)}
                          />
                          {option.label}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          </section>
        ))}
      </div>

      <button type="button" className="btn-secondary mt-4" onClick={addGroup}>
        <Plus size={18} aria-hidden="true" /> Añadir caja física
      </button>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
        <p className="text-sm text-muted">
          <strong className="text-foreground">{groups.length}</strong> variantes físicas ·{" "}
          <strong className="text-foreground">{regionalRecordCount}</strong> fichas regionales
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" disabled={loading || !title.trim()} onClick={() => submit(false)}>
            {loading ? "Guardando…" : "Crear lote para revisar"}
          </button>
          <button type="button" className="btn-primary" disabled={loading || !title.trim()} onClick={() => submit(true)}>
            {loading ? "Publicando…" : "Crear y publicar lote"}
          </button>
        </div>
      </div>

      {error ? <p className="mt-4 rounded-md border border-danger/35 bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}
      {result ? (
        <p className="mt-4 rounded-md border border-success/35 bg-success/10 p-3 text-sm text-foreground">
          Lote creado: {result.physicalVariantCount} variantes físicas y {result.regionalRecordCount} fichas regionales.
        </p>
      ) : null}
    </Panel>
  );
}
