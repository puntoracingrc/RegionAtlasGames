"use client";

import { useMemo, useState } from "react";
import { Badge, Panel, PanelTitle } from "@/components/ui";

type PlatformOption = {
  slug: string;
  name: string;
  shortName?: string;
  active?: boolean;
};

type ImportResult = {
  ok: true;
  selected: {
    platformSlug: string;
    platformName: string;
    region: string;
    initialFilter: string;
  };
  stats: {
    totalRows: number;
    parsedItems: number;
    platformMatched: number;
    afterInitial: number;
    queued: number;
    skippedPublished: number;
    skippedAlreadyQueued: number;
    skippedNoPcId: number;
    discardedOtherPlatforms: number;
    warnings: string[];
  };
  staging: {
    created: number;
    updated: number;
    totalQueued: number;
  };
  samples: {
    queued: Array<{ title: string; pcId: number | null }>;
    published: Array<{ title: string; pcId: number | null }>;
    alreadyQueued: Array<{ title: string; pcId: number | null }>;
    noPcId: Array<{ title: string }>;
  };
};

type Props = {
  platforms: PlatformOption[];
  regions: readonly string[];
};

function StatCard({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background/45 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 text-2xl font-black text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function SampleList({
  title,
  items,
}: {
  title: string;
  items: Array<{ title: string; pcId?: number | null }>;
}) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border bg-background/45 p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{title}</p>
      <ul className="space-y-1 text-sm text-muted">
        {items.map((item) => (
          <li key={`${item.pcId ?? "noid"}-${item.title}`} className="truncate">
            {item.title}
            {item.pcId ? <span className="font-mono text-[11px]"> · {item.pcId}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AdminCatalogImportPanel({ platforms, regions }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [platformSlug, setPlatformSlug] = useState("all");
  const [region, setRegion] = useState(regions[0] ?? "PAL España");
  const [initialFilter, setInitialFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const selectedPlatform = useMemo(
    () => platforms.find((platform) => platform.slug === platformSlug),
    [platformSlug, platforms],
  );
  const platformLabel =
    platformSlug === "all" ? "Todas" : selectedPlatform?.shortName ?? selectedPlatform?.name ?? platformSlug;
  const initialLabel = initialFilter.trim() || "Todas";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Selecciona un archivo CSV o Excel.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("platformSlug", platformSlug);
      form.append("region", region);
      form.append("initialFilter", initialFilter);

      const res = await fetch("/api/admin/catalog-import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo importar el catálogo.");
        return;
      }
      setResult(data);
    } catch {
      setError("Error de red al importar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Panel>
        <PanelTitle eyebrow="Importación catálogo">CSV/Excel → Cola de revisión</PanelTitle>
        <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
          <div className="rounded-2xl border border-border bg-background/45 p-4">
            <p className="text-sm leading-6 text-muted">
              Esta herramienta crea fichas pendientes desde exportaciones tipo PriceCharting sin tocar ninguna
              colección personal. Puedes forzar una plataforma concreta o dejar que use todas las plataformas
              detectadas en el archivo, incluidas las creadas en admin aunque estén en OFF.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <StatCard label="Plataforma" value={platformLabel} hint={region} />
              <StatCard label="Filtro inicial" value={initialLabel} hint="A, A-C, ABC o todas" />
              <StatCard label="Duplicados" value="Se saltan" hint="Publicados o ya en revisión" />
            </div>
          </div>

          <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-border bg-background/45 p-4">
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Archivo</span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="input"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted">Plataforma destino</span>
                <select className="input" value={platformSlug} onChange={(e) => setPlatformSlug(e.target.value)}>
                  <option value="all">Todas las detectadas en el archivo</option>
                  {platforms.map((platform) => (
                    <option key={platform.slug} value={platform.slug}>
                      {platform.name} ({platform.slug}){platform.active === false ? " · OFF" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted">Región destino</span>
                <select className="input" value={region} onChange={(e) => setRegion(e.target.value)}>
                  {regions.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3">
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted">Iniciales</span>
                <input
                  className="input"
                  value={initialFilter}
                  onChange={(e) => setInitialFilter(e.target.value)}
                  placeholder="Todas, A, A-C, ABC, A,B,C..."
                />
                <span className="block text-xs text-muted">
                  Déjalo vacío para todo. Puedes poner una letra, varias letras o un rango.
                </span>
              </label>
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Importando… no cierres esta ventana" : "Crear pendientes de revisión"}
            </button>
            {loading ? (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
                Importando catálogo… estoy leyendo el archivo, filtrando duplicados y creando la revisión.
              </div>
            ) : null}
          </form>
        </div>
      </Panel>

      {error ? (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      {result ? (
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <PanelTitle eyebrow="Resultado">Importación preparada</PanelTitle>
            <Badge tone={result.stats.queued > 0 ? "green" : "amber"}>
              {result.stats.queued} nuevas en revisión
            </Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Filas leídas" value={result.stats.totalRows} />
            <StatCard label="Plataforma válida" value={result.stats.platformMatched} />
            <StatCard label="Descartadas otras" value={result.stats.discardedOtherPlatforms} />
            <StatCard label="Total cola" value={result.staging.totalQueued} />
            <StatCard label="Ya publicadas" value={result.stats.skippedPublished} />
            <StatCard label="Ya en revisión" value={result.stats.skippedAlreadyQueued} />
            <StatCard label="Sin ID PC" value={result.stats.skippedNoPcId} />
            <StatCard label="Creadas ahora" value={result.staging.created} />
          </div>

          {result.stats.warnings.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              {result.stats.warnings.join(" ")}
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <SampleList title="Entraron en revisión" items={result.samples.queued} />
            <SampleList title="Saltadas: ya publicadas" items={result.samples.published} />
            <SampleList title="Saltadas: ya estaban en cola" items={result.samples.alreadyQueued} />
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
