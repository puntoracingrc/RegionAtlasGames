"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { adminToneClass } from "@/components/admin/admin-visual";
import { Panel, PanelTitle } from "@/components/ui";
import {
  AdminSimilarGamesPanel,
  type SimilarCatalogMatchView,
} from "@/components/admin/admin-similar-games-panel";
import {
  ControlledTaxonomySelector,
  EntityCombo,
  type CompanyOption,
} from "@/components/admin/admin-game-editor";
import type { AdminGameEditorTaxonomyOption } from "@/lib/admin-game-editor-options";
import { PHYSICAL_VARIANTS } from "@/lib/physical-variants";

type PlatformOption = { slug: string; name: string };
type TaxonomyOptions = {
  genres: AdminGameEditorTaxonomyOption[];
  subgenres: AdminGameEditorTaxonomyOption[];
  facets: AdminGameEditorTaxonomyOption[];
};

type Props = {
  platforms: PlatformOption[];
  regions: readonly string[];
  companies?: CompanyOption[];
  taxonomyOptions?: TaxonomyOptions;
  createApiUrl?: string;
  similarApiUrl?: string;
  redirectBase?: string;
  contributorMode?: boolean;
};

type CreatePayload = {
  title: string;
  platformSlug: string;
  region: string;
  reference?: string;
  slug?: string;
  physicalVariant?: string | null;
  coverUrl?: string | null;
  year?: number | null;
  releaseDate?: string | null;
  players?: number | null;
  support?: string | null;
  developerName?: string | null;
  developerSlug?: string | null;
  publisherName?: string | null;
  publisherSlug?: string | null;
  genreNames?: string[];
  subgenreNames?: string[];
  facetNames?: string[];
  description?: string | null;
  autoEnrich: boolean;
  autoAi: boolean;
  confirmDistinct?: boolean;
};

export function AdminNewGameForm({
  platforms,
  regions,
  companies = [],
  taxonomyOptions = { genres: [], subgenres: [], facets: [] },
  createApiUrl = "/api/admin/games",
  similarApiUrl = "/api/admin/games/similar",
  redirectBase = "/admin/cola",
  contributorMode = false,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [platformSlug, setPlatformSlug] = useState(platforms[0]?.slug ?? "snes");
  const [region, setRegion] = useState(regions[0] ?? "PAL España");
  const [reference, setReference] = useState("");
  const [slug, setSlug] = useState("");
  const [physicalVariant, setPhysicalVariant] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [year, setYear] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [players, setPlayers] = useState("");
  const [support, setSupport] = useState("");
  const [developerName, setDeveloperName] = useState("");
  const [developerSlug, setDeveloperSlug] = useState("");
  const [publisherName, setPublisherName] = useState("");
  const [publisherSlug, setPublisherSlug] = useState("");
  const [genreNames, setGenreNames] = useState<string[]>([]);
  const [subgenreNames, setSubgenreNames] = useState<string[]>([]);
  const [facetNames, setFacetNames] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [autoAi, setAutoAi] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [similarMatches, setSimilarMatches] = useState<SimilarCatalogMatchView[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showSimilarGate, setShowSimilarGate] = useState(false);

  const platformLabel = useMemo(
    () => platforms.find((p) => p.slug === platformSlug)?.name ?? platformSlug,
    [platforms, platformSlug],
  );

  useEffect(() => {
    if (showSimilarGate || title.trim().length < 3) {
      if (title.trim().length < 3) setSimilarMatches([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const params = new URLSearchParams({
          title: title.trim(),
          platformSlug,
          region,
        });
        if (slug.trim()) params.set("slug", slug.trim());
        const res = await fetch(`${similarApiUrl}?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { matches?: SimilarCatalogMatchView[] };
        setSimilarMatches(data.matches ?? []);
      } catch {
        /* ignore abort / network */
      } finally {
        setPreviewLoading(false);
      }
    }, 450);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [title, platformSlug, region, slug, showSimilarGate]);

  async function createGame(payload: CreatePayload) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(createApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.status === 409 && data.error === "similar_games" && Array.isArray(data.matches)) {
        setSimilarMatches(data.matches as SimilarCatalogMatchView[]);
        setShowSimilarGate(true);
        return;
      }

      if (!res.ok) {
        setError(data.error ?? "No se pudo crear el borrador.");
        return;
      }

      setShowSimilarGate(false);
      setSimilarMatches([]);
      router.push(data.redirect ?? `${redirectBase}/${data.pcId}`);
    } catch {
      setError("Error de red.");
    } finally {
      setLoading(false);
    }
  }

  function buildPayload(confirmDistinct = false): CreatePayload {
    return {
      title,
      platformSlug,
      region,
      reference: reference || undefined,
      slug: slug || undefined,
      physicalVariant: physicalVariant || null,
      coverUrl: coverUrl || null,
      year: year.trim() ? Number.parseInt(year, 10) : null,
      releaseDate: releaseDate || null,
      players: players.trim() ? Number.parseInt(players, 10) : null,
      support: support || null,
      developerName: developerName || null,
      developerSlug: developerSlug || null,
      publisherName: publisherName || null,
      publisherSlug: publisherSlug || null,
      genreNames,
      subgenreNames,
      facetNames,
      description: description || null,
      autoEnrich: !contributorMode,
      autoAi: contributorMode ? false : autoAi,
      confirmDistinct,
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (similarMatches.length > 0 && !showSimilarGate) {
      setShowSimilarGate(true);
      return;
    }
    if (showSimilarGate) return;
    await createGame(buildPayload(false));
  }

  async function onConfirmDistinct() {
    await createGame(buildPayload(true));
  }

  function onCancelSimilar() {
    setShowSimilarGate(false);
    setSimilarMatches([]);
  }

  const gateActive = showSimilarGate && similarMatches.length > 0;

  return (
    <Panel className={adminToneClass("edit")}>
      <PanelTitle eyebrow="Alta manual">
        {contributorMode ? "Nueva ficha para revisión" : "Nuevo juego manual"}
      </PanelTitle>
      <p className="mb-5 max-w-3xl text-sm leading-6 text-muted">
        {contributorMode
          ? "Crea una ficha nueva. Solo puedes enviarla a revisión; el administrador decidirá si publicarla."
          : "Crea una ficha desde cero. Al escribir el título verás si ya hay nombres parecidos en el catálogo. Al guardar se busca portada en PriceCharting y, si activas la opción, la IA rellenará metadatos y descripción en directo."}
      </p>

      <form
        onSubmit={onSubmit}
        className="grid max-w-6xl gap-4 rounded-2xl border border-border bg-background/45 p-4 md:grid-cols-2"
      >
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">Título</span>
          <input
            required
            className="input"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setShowSimilarGate(false);
            }}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">Plataforma</span>
          <select
            className="input"
            value={platformSlug}
            onChange={(e) => {
              setPlatformSlug(e.target.value);
              setShowSimilarGate(false);
            }}
          >
            {platforms.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">Región</span>
          <select
            className="input"
            value={region}
            onChange={(e) => {
              setRegion(e.target.value);
              setShowSimilarGate(false);
            }}
          >
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">
            Referencia SKU / CUSA (opcional)
          </span>
          <input
            className="input font-mono"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">Slug (opcional)</span>
          <input
            className="input font-mono text-xs"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setShowSimilarGate(false);
            }}
            placeholder="Se genera del título si lo dejas vacío"
          />
        </label>

        {!contributorMode && (
          <>
            <div className="md:col-span-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted">Datos de ficha</p>
            </div>

            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Edición física</span>
              <select
                className="input"
                value={physicalVariant}
                onChange={(e) => setPhysicalVariant(e.target.value)}
              >
                <option value="">Sin especificar</option>
                {PHYSICAL_VARIANTS.map((variant) => (
                  <option key={variant.slug} value={variant.label}>
                    {variant.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Año</span>
              <input
                className="input"
                type="number"
                min={1950}
                max={2100}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="Ej. 2004"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Fecha lanzamiento</span>
              <input
                className="input"
                value={releaseDate}
                onChange={(e) => setReleaseDate(e.target.value)}
                placeholder="Ej. 18 noviembre 2004"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Jugadores</span>
              <input
                className="input"
                type="number"
                min={1}
                max={999}
                value={players}
                onChange={(e) => setPlayers(e.target.value)}
                placeholder="Ej. 1"
              />
            </label>

            <label className="block space-y-1 md:col-span-2">
              <span className="text-[10px] uppercase tracking-wider text-muted">Soporte / formato</span>
              <input
                className="input"
                value={support}
                onChange={(e) => setSupport(e.target.value)}
                placeholder="Ej. Blu-ray, cartucho, CD-ROM..."
              />
            </label>

            <div className="md:col-span-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted">Compañías</p>
            </div>

            <EntityCombo
              label="Desarrolladora"
              name={developerName}
              slug={developerSlug}
              options={companies}
              onChange={(nextName, nextSlug) => {
                setDeveloperName(nextName);
                setDeveloperSlug(nextSlug ?? "");
              }}
            />
            <EntityCombo
              label="Editora"
              name={publisherName}
              slug={publisherSlug}
              options={companies}
              onChange={(nextName, nextSlug) => {
                setPublisherName(nextName);
                setPublisherSlug(nextSlug ?? "");
              }}
            />

            <div className="md:col-span-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted">Taxonomía</p>
            </div>

            <ControlledTaxonomySelector
              label="Géneros"
              helper="Elige géneros principales oficiales en castellano."
              selected={genreNames}
              options={taxonomyOptions.genres}
              onChange={setGenreNames}
              disabled={loading}
            />
            <ControlledTaxonomySelector
              label="Subgéneros"
              helper="Opciones controladas vinculadas a la jugabilidad principal."
              selected={subgenreNames}
              options={taxonomyOptions.subgenres}
              onChange={setSubgenreNames}
              disabled={loading}
            />
            <ControlledTaxonomySelector
              label="Facetas"
              helper="Formato, perspectiva, jugadores, temas, edición y otras señales controladas."
              selected={facetNames}
              options={taxonomyOptions.facets}
              onChange={setFacetNames}
              disabled={loading}
            />

            <div className="md:col-span-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted">Contenido</p>
            </div>

            <label className="block space-y-1 md:col-span-2">
              <span className="text-[10px] uppercase tracking-wider text-muted">URL portada</span>
              <input
                className="input font-mono text-xs"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                placeholder="https://... o /covers/..."
              />
            </label>

            <label className="block space-y-1 md:col-span-2">
              <span className="text-[10px] uppercase tracking-wider text-muted">Descripción</span>
              <textarea
                className="input min-h-40"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Puedes dejarla vacía y lanzar IA al abrir el editor."
              />
            </label>
          </>
        )}

        {!contributorMode && (
          <label className="flex items-center gap-3 rounded-xl border border-border bg-card/70 p-3 text-sm md:col-span-2">
            <input
              type="checkbox"
              checked={autoAi}
              onChange={(e) => setAutoAi(e.target.checked)}
            />
            <span>
              <span className="block font-medium text-foreground">
                Crear ficha y completar huecos con IA en el editor
              </span>
              <span className="text-xs text-muted">
                Respeta los campos que ya hayas rellenado y solo intenta completar lo que falte.
              </span>
            </span>
          </label>
        )}

        {(gateActive ||
          previewLoading ||
          (similarMatches.length > 0 && title.trim().length >= 3 && !gateActive)) && (
          <AdminSimilarGamesPanel
            pendingTitle={title.trim()}
            pendingRegion={region}
            pendingPlatformLabel={platformLabel}
            matches={similarMatches}
            mode={gateActive ? "confirm" : "preview"}
            loading={previewLoading && !gateActive}
            confirmLoading={loading}
            onConfirmDistinct={gateActive ? () => void onConfirmDistinct() : undefined}
            onCancel={gateActive ? onCancelSimilar : undefined}
          />
        )}

        {!gateActive && (
          <div className="md:col-span-2">
            <button type="submit" className="btn-primary w-full sm:w-auto" disabled={loading || previewLoading}>
              {loading
                ? "Creando…"
                : contributorMode
                  ? "Crear ficha"
                  : autoAi
                    ? "Crear ficha y completar huecos con IA en el editor"
                    : "Crear y abrir editor"}
            </button>
          </div>
        )}

        {error && <p className="text-sm text-rose-600 dark:text-rose-400 md:col-span-2">{error}</p>}
      </form>
    </Panel>
  );
}
