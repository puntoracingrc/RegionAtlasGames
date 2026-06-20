"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RegionFlag } from "@/components/region-flag";
import type { CatalogTaxonomyFilterOption } from "@/lib/catalog-filters";
import { formatEur } from "@/lib/price-format";

type PlatformOption = {
  slug: string;
  name: string;
  shortName: string;
};

type RegionOption = {
  value: string;
  label: string;
  count: number;
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
  taxonomyOptions?: TaxonomyOptions;
};

type TaxonomyOptions = {
  genres: CatalogTaxonomyFilterOption[];
  subgenres: CatalogTaxonomyFilterOption[];
  facets: CatalogTaxonomyFilterOption[];
};

type Props = {
  platforms: PlatformOption[];
  regions: RegionOption[];
  taxonomyOptions: TaxonomyOptions;
};

export function HomeCatalogSearch({ platforms, regions, taxonomyOptions: initialTaxonomyOptions }: Props) {
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState("all");
  const [region, setRegion] = useState("all");
  const [genre, setGenre] = useState("all");
  const [subgenre, setSubgenre] = useState("all");
  const [facet, setFacet] = useState("all");
  const [payload, setPayload] = useState<SearchPayload>({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const taxonomyOptions = payload.taxonomyOptions ?? initialTaxonomyOptions;

  const hasSearch =
    q.trim().length >= 2 ||
    platform !== "all" ||
    region !== "all" ||
    genre !== "all" ||
    subgenre !== "all" ||
    facet !== "all";
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
        const params = new URLSearchParams({ q, platform, region, genre, subgenre, facet });
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

  useEffect(() => {
    if (genre !== "all" && !taxonomyOptions.genres.some((item) => item.slug === genre)) setGenre("all");
  }, [genre, taxonomyOptions.genres]);

  useEffect(() => {
    if (subgenre !== "all" && !taxonomyOptions.subgenres.some((item) => item.slug === subgenre)) setSubgenre("all");
  }, [subgenre, taxonomyOptions.subgenres]);

  useEffect(() => {
    if (facet !== "all" && !taxonomyOptions.facets.some((item) => item.slug === facet)) setFacet("all");
  }, [facet, taxonomyOptions.facets]);

  return (
    <section className="mb-7 overflow-hidden rounded-2xl border border-border bg-card/80 p-4 shadow-lg shadow-slate-950/5 backdrop-blur dark:shadow-black/20 md:p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">Buscar juego</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-foreground">Encuentra una ficha al instante</h2>
          <p className="mt-1 text-sm text-muted">
            Busca por título, SKU, compañía o cruza plataforma, región, género, subgénero y faceta.
          </p>
        </div>
        {hasSearch && (
          <p className="text-sm font-medium text-muted">
            {loading ? "Buscando…" : `${payload.total.toLocaleString("es-ES")} resultados`}
          </p>
        )}
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_210px_210px]">
        <input
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Ej. Akinofa, Zelda, CUSA, Erdem Sen…"
          className="min-h-12 rounded-xl border border-border bg-input px-4 text-base outline-none ring-accent/25 placeholder:text-muted focus:ring-2 md:col-span-2 xl:col-span-1"
        />
        <select
          value={platform}
          onChange={(event) => setPlatform(event.target.value)}
          className="min-h-12 rounded-xl border border-border bg-input px-3 text-sm outline-none ring-accent/25 focus:ring-2"
        >
          <option value="all">Todas las plataformas</option>
          {platforms.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.shortName || item.name}
            </option>
          ))}
        </select>
        <select
          value={region}
          onChange={(event) => setRegion(event.target.value)}
          className="min-h-12 rounded-xl border border-border bg-input px-3 text-sm outline-none ring-accent/25 focus:ring-2"
        >
          <option value="all">Todas las regiones</option>
          {regions.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label} ({item.count.toLocaleString("es-ES")})
            </option>
          ))}
        </select>
        <select
          value={genre}
          onChange={(event) => setGenre(event.target.value)}
          className="min-h-12 rounded-xl border border-border bg-input px-3 text-sm outline-none ring-accent/25 focus:ring-2"
        >
          <option value="all">Todos los géneros</option>
          {taxonomyOptions.genres.map((item) => (
            <option key={item.slug} value={item.slug}>
              {taxonomyOptionLabel(item)}
            </option>
          ))}
        </select>
        <select
          value={subgenre}
          onChange={(event) => setSubgenre(event.target.value)}
          className="min-h-12 rounded-xl border border-border bg-input px-3 text-sm outline-none ring-accent/25 focus:ring-2"
        >
          <option value="all">Todos los subgéneros</option>
          {taxonomyOptions.subgenres.map((item) => (
            <option key={item.slug} value={item.slug}>
              {taxonomyOptionLabel(item)}
            </option>
          ))}
        </select>
        <select
          value={facet}
          onChange={(event) => setFacet(event.target.value)}
          className="min-h-12 rounded-xl border border-border bg-input px-3 text-sm outline-none ring-accent/25 focus:ring-2"
        >
          <option value="all">Todas las facetas</option>
          {taxonomyOptions.facets.map((item) => (
            <option key={item.slug} value={item.slug}>
              {taxonomyOptionLabel(item)}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 min-h-[72px]">
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
                className="group flex items-center gap-3 rounded-xl border border-border bg-background/45 p-2.5 transition hover:-translate-y-0.5 hover:border-accent/40 hover:bg-card-hover"
              >
                <div className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card">
                  {game.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={game.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <span className="text-[10px] font-semibold text-muted">SIN</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground group-hover:text-accent">{game.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span className="rounded bg-accent/10 px-1.5 py-0.5 font-semibold text-accent">{game.platform}</span>
                    <RegionFlag region={game.region} size="xs" showLabel labelMode="short" />
                    {game.year ? <span>{game.year}</span> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted">{game.price != null ? formatEur(game.price) : "Precio pendiente"}</p>
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
              Ver en {platforms.find((item) => item.slug === platform)?.shortName ?? "plataforma"} →
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

function taxonomyOptionLabel(item: CatalogTaxonomyFilterOption): string {
  return `${item.name} (${item.count.toLocaleString("es-ES")})`;
}
