"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RegionFilterChips } from "@/components/region-filter-chips";
import { RegionFlag } from "@/components/region-flag";
import { formatEur } from "@/lib/price-format";

type PlatformOption = {
  slug: string;
  name: string;
  shortName: string;
};

type RegionOption = {
  value: string;
  label: string;
  count?: number;
};

type TaxonomyOption = {
  slug: string;
  name: string;
};

type SearchResult = {
  id: string;
  title: string;
  href: string;
  platform: string;
  platformSlug: string;
  region: string;
  year: number | null;
  price: number | null;
  coverUrl: string | null;
};

type SearchPayload = {
  items: SearchResult[];
  total: number;
};

type Props = {
  platforms: PlatformOption[];
  regions: RegionOption[];
  genres: TaxonomyOption[];
};

export function HomeCatalogSearch({ platforms, regions, genres }: Props) {
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState("all");
  const [region, setRegion] = useState("all");
  const [genre, setGenre] = useState("all");
  const [subgenre, setSubgenre] = useState("all");
  const [facet, setFacet] = useState("all");
  const [subgenreQuery, setSubgenreQuery] = useState("");
  const [facetQuery, setFacetQuery] = useState("");
  const [subgenreOptions, setSubgenreOptions] = useState<TaxonomyOption[]>([]);
  const [facetOptions, setFacetOptions] = useState<TaxonomyOption[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [payload, setPayload] = useState<SearchPayload>({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);

  const hasAdvancedFilters = genre !== "all" || subgenre !== "all" || facet !== "all";
  const hasSearch = q.trim().length >= 2 || platform !== "all" || region !== "all" || hasAdvancedFilters;
  const hasDraftText = q.trim().length > 0 && q.trim().length < 2;
  const selectedPlatformLabel = platforms.find((item) => item.slug === platform)?.shortName ?? "plataforma";
  const allResultsHref = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (platform !== "all") params.set("platform", platform);
    if (region !== "all") params.set("region", region);
    if (genre !== "all") params.set("genre", genre);
    if (subgenre !== "all") params.set("subgenre", subgenre);
    if (facet !== "all") params.set("facet", facet);
    return `/catalogo${params.size ? `?${params}` : ""}`;
  }, [facet, genre, platform, q, region, subgenre]);

  const platformResultsHref = useMemo(() => {
    if (platform !== "all") {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (region !== "all") params.set("region", region);
      if (genre !== "all") params.set("genre", genre);
      if (subgenre !== "all") params.set("subgenre", subgenre);
      if (facet !== "all") params.set("facet", facet);
      return `/plataforma/${platform}${params.size ? `?${params}` : ""}`;
    }
  }, [facet, genre, platform, q, region, subgenre]);

  function clearFilters() {
    setQ("");
    setPlatform("all");
    setRegion("all");
    setGenre("all");
    setSubgenre("all");
    setFacet("all");
    setSubgenreQuery("");
    setFacetQuery("");
    setPayload({ items: [], total: 0 });
    setLoading(false);
  }

  useEffect(() => {
    if (!advancedOpen) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ type: "subgenre", q: subgenreQuery.trim() });
        params.set("mode", "taxonomy-options");
        const response = await fetch(`/api/catalog/search?${params}`, { signal: controller.signal });
        if (!response.ok) return;
        const payload = (await response.json()) as { items: TaxonomyOption[] };
        setSubgenreOptions(payload.items);
      } catch (error) {
        if (!controller.signal.aborted) console.warn("[home-search] subgenre options failed", error);
      }
    }, subgenreQuery.trim() ? 160 : 0);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [advancedOpen, subgenreQuery]);

  useEffect(() => {
    if (!advancedOpen) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ type: "facet", q: facetQuery.trim() });
        params.set("mode", "taxonomy-options");
        const response = await fetch(`/api/catalog/search?${params}`, { signal: controller.signal });
        if (!response.ok) return;
        const payload = (await response.json()) as { items: TaxonomyOption[] };
        setFacetOptions(payload.items);
      } catch (error) {
        if (!controller.signal.aborted) console.warn("[home-search] facet options failed", error);
      }
    }, facetQuery.trim() ? 160 : 0);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [advancedOpen, facetQuery]);

  useEffect(() => {
    if (!hasSearch) {
      setPayload({ items: [], total: 0 });
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q, platform, region });
        if (genre !== "all") params.set("genre", genre);
        if (subgenre !== "all") params.set("subgenre", subgenre);
        if (facet !== "all") params.set("facet", facet);
        const response = await fetch(`/api/catalog/search?${params}`, { signal: controller.signal });
        if (!response.ok) return;
        setPayload((await response.json()) as SearchPayload);
      } catch (error) {
        if (!controller.signal.aborted) console.warn("[home-search] search failed", error);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, q.trim() ? 180 : 0);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [facet, genre, hasSearch, platform, q, region, subgenre]);

  return (
    <section className="mb-7 overflow-hidden rounded-2xl border border-border bg-card/85 p-3 shadow-xl shadow-slate-950/5 backdrop-blur dark:shadow-black/25 md:p-4">
      <div className="flex flex-col gap-3 border-b border-border/70 px-1 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">Buscar juego</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-foreground md:text-3xl">Encuentra una ficha al instante</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Título, SKU, compañía o género; afina por plataforma y región sin cargar listas pesadas.
          </p>
        </div>
        {(hasSearch || hasDraftText) && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex min-h-9 items-center rounded-full border border-accent/25 bg-accent/10 px-3 text-sm font-semibold text-accent">
              {hasDraftText && !hasSearch
                ? "Escribe 2 letras"
                : loading
                  ? "Buscando..."
                  : `${payload.total.toLocaleString("es-ES")} resultados`}
            </span>
            {hasSearch && (
              <button type="button" onClick={clearFilters} className="btn-secondary min-h-9 px-3 py-1.5 text-xs">
                Limpiar
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start">
        <label className="block">
          <span className="sr-only">Buscar por juego, SKU, compañía o género</span>
          <input
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Ej. Devil May Cry, Zelda, CUSA, Capcom..."
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-h-14 w-full rounded-2xl border border-border bg-input px-4 text-base font-medium outline-none ring-accent/25 placeholder:text-muted focus:border-accent/45 focus:ring-2 md:text-lg"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.2em] text-muted">Plataforma</span>
          <select
            value={platform}
            onChange={(event) => setPlatform(event.target.value)}
            className="min-h-12 w-full rounded-xl border border-border bg-input px-3 text-sm font-medium outline-none ring-accent/25 focus:border-accent/45 focus:ring-2"
          >
            <option value="all">Todas las plataformas</option>
            {platforms.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.shortName || item.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 rounded-2xl border border-border/70 bg-background/35 p-3">
        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted">Región</p>
        <RegionFilterChips value={region} onChange={setRegion} options={regions} allLabel="Todas" />
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border border-border/70 bg-background/35">
        <button
          type="button"
          onClick={() => setAdvancedOpen((value) => !value)}
          className="flex min-h-12 w-full items-center justify-between gap-3 px-3 text-left"
          aria-expanded={advancedOpen}
        >
          <span>
            <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted">Afinar búsqueda</span>
            <span className="text-sm font-semibold text-foreground">
              Género, subgénero y facetas
              {hasAdvancedFilters ? " activos" : ""}
            </span>
          </span>
          <span className="rounded-full border border-border bg-card px-2 py-1 text-xs font-bold text-muted">
            {advancedOpen ? "Cerrar" : "Abrir"}
          </span>
        </button>

        {advancedOpen && (
          <div className="grid gap-3 border-t border-border/70 p-3 lg:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.2em] text-muted">Género</span>
              <select
                value={genre}
                onChange={(event) => setGenre(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-border bg-input px-3 text-sm font-medium outline-none ring-accent/25 focus:border-accent/45 focus:ring-2"
              >
                <option value="all">Todos los géneros</option>
                {genres.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <TaxonomySuggest
              label="Subgénero"
              value={subgenre}
              query={subgenreQuery}
              options={subgenreOptions}
              placeholder="FPS, metroidvania..."
              onQueryChange={(value) => {
                setSubgenreQuery(value);
                setSubgenre("all");
              }}
              onSelect={(option) => {
                setSubgenre(option.slug);
                setSubgenreQuery(option.name);
              }}
              onClear={() => {
                setSubgenre("all");
                setSubgenreQuery("");
              }}
            />

            <TaxonomySuggest
              label="Faceta"
              value={facet}
              query={facetQuery}
              options={facetOptions}
              placeholder="Cooperativo, terror..."
              onQueryChange={(value) => {
                setFacetQuery(value);
                setFacet("all");
              }}
              onSelect={(option) => {
                setFacet(option.slug);
                setFacetQuery(option.name);
              }}
              onClear={() => {
                setFacet("all");
                setFacetQuery("");
              }}
            />
          </div>
        )}
      </div>

      <div className="mt-4 min-h-[76px]">
        {!hasSearch ? (
          <div className="rounded-xl border border-dashed border-border bg-background/45 p-4 text-sm text-muted">
            Escribe al menos 2 letras o elige una plataforma/región para empezar.
          </div>
        ) : payload.items.length === 0 && !loading ? (
          <div className="rounded-xl border border-dashed border-border bg-background/45 p-4 text-sm text-muted">
            No he encontrado fichas con esos filtros. Prueba sin región o con menos palabras.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {payload.items.map((game) => (
              <Link
                key={game.id}
                href={game.href}
                className="group flex min-h-[78px] items-center gap-3 rounded-xl border border-border bg-background/45 p-2 transition hover:-translate-y-0.5 hover:border-accent/40 hover:bg-card-hover"
              >
                <div className="flex h-[66px] w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card">
                  {game.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={game.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <span className="text-[10px] font-semibold text-muted">SIN</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground group-hover:text-accent">{game.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                    <span className="rounded-md bg-accent/10 px-1.5 py-0.5 font-bold text-accent">{game.platform}</span>
                    <RegionFlag region={game.region} size="xs" showLabel labelMode="short" />
                    {game.year ? <span>{game.year}</span> : null}
                  </div>
                  <p className="mt-1 text-xs font-semibold text-foreground/80">{game.price != null ? formatEur(game.price) : "Precio pendiente"}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {hasSearch && payload.total > payload.items.length && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          {platformResultsHref && (
            <Link href={platformResultsHref} className="btn-secondary text-sm">
              Ver en {selectedPlatformLabel} →
            </Link>
          )}
          <Link href={allResultsHref} className="btn-secondary text-sm">
            Ver todos los resultados →
          </Link>
        </div>
      )}
    </section>
  );
}

function TaxonomySuggest({
  label,
  value,
  query,
  options,
  placeholder,
  onQueryChange,
  onSelect,
  onClear,
}: {
  label: string;
  value: string;
  query: string;
  options: TaxonomyOption[];
  placeholder: string;
  onQueryChange: (value: string) => void;
  onSelect: (option: TaxonomyOption) => void;
  onClear: () => void;
}) {
  return (
    <div className="block">
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">{label}</label>
        {value !== "all" && (
          <button type="button" onClick={onClear} className="text-xs font-semibold text-accent hover:underline">
            Quitar
          </button>
        )}
      </div>
      <input
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className="min-h-11 w-full rounded-xl border border-border bg-input px-3 text-sm font-medium outline-none ring-accent/25 placeholder:text-muted focus:border-accent/45 focus:ring-2"
      />
      <div className="mt-2 flex min-h-9 flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option.slug}
            type="button"
            onClick={() => onSelect(option)}
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
              value === option.slug
                ? "border-accent/50 bg-accent/15 text-accent"
                : "border-border bg-card text-foreground/80 hover:border-accent/30 hover:bg-card-hover"
            }`}
          >
            {option.name}
          </button>
        ))}
      </div>
    </div>
  );
}
