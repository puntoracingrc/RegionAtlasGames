"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminSeriesPanel } from "@/components/admin/admin-series-panel";
import { AdminFunctionCard, AdminNotice, adminToneClass } from "@/components/admin/admin-visual";
import { Badge, Panel, PanelTitle } from "@/components/ui";

type EntityTab = "platforms" | "companies" | "genres";
type Tab = EntityTab | "series";

type PlatformRow = {
  slug: string;
  name: string;
  shortName: string;
  manufacturer: string;
  status: string;
  catalogGames: number;
  active?: boolean;
  newsEnabled?: boolean;
};

type IndexRow = {
  slug: string;
  name: string;
  gameCount: number;
  active?: boolean;
  history?: string | null;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  foundedYear?: number | null;
  closedYear?: number | null;
  status?: "active" | "defunct" | "subsidiary" | "unknown";
  parentCompany?: CompanyRelation | null;
  acquiredByCompany?: CompanyRelation | null;
  successorCompany?: CompanyRelation | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
};

type CompanyRelation = {
  slug: string;
  name: string;
};

type EntitySort = "alpha-asc" | "alpha-desc" | "games-desc" | "games-asc";
type CompanyAiTarget = "history" | "logo" | "website" | "years" | "seo";

const tabs: { id: Tab; label: string }[] = [
  { id: "platforms", label: "Plataformas" },
  { id: "companies", label: "Compañías" },
  { id: "genres", label: "Géneros" },
  { id: "series", label: "Sagas" },
];

const sortOptions: { value: EntitySort; label: string }[] = [
  { value: "alpha-asc", label: "A-Z" },
  { value: "alpha-desc", label: "Z-A" },
  { value: "games-desc", label: "Más juegos" },
  { value: "games-asc", label: "Menos juegos" },
];

function isTab(value: string | null): value is Tab {
  return tabs.some((item) => item.id === value);
}

function initialTab(): Tab {
  if (typeof window === "undefined") return "platforms";
  const tabParam = new URLSearchParams(window.location.search).get("tab");
  return isTab(tabParam) ? tabParam : "platforms";
}

function matchesSearch(row: { name: string; slug: string }, search: string): boolean {
  const query = normalizeSearchText(search);
  if (!query) return true;
  const queryTokens = query.split(/\s+/).filter(Boolean);
  const searchable = [row.name, row.slug].map(normalizeSearchText);
  return queryTokens.every((token) =>
    searchable.some((field) => {
      const words = field.split(/\s+/).filter(Boolean);
      return words.includes(token) || words.some((word) => word.startsWith(token));
    }),
  );
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function gameCount(row: PlatformRow | IndexRow): number {
  return "catalogGames" in row ? row.catalogGames : row.gameCount;
}

function sortEntities<T extends PlatformRow | IndexRow>(rows: T[], sort: EntitySort): T[] {
  return [...rows].sort((a, b) => {
    if (sort === "alpha-asc") return a.name.localeCompare(b.name, "es", { numeric: true });
    if (sort === "alpha-desc") return b.name.localeCompare(a.name, "es", { numeric: true });
    if (sort === "games-desc") return gameCount(b) - gameCount(a) || a.name.localeCompare(b.name, "es", { numeric: true });
    return gameCount(a) - gameCount(b) || a.name.localeCompare(b.name, "es", { numeric: true });
  });
}

function AiMagicButton({
  label,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="rounded-full border border-violet-300/60 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-800 transition hover:bg-violet-500/15 disabled:cursor-not-allowed disabled:opacity-45 dark:text-violet-200"
      disabled={disabled || busy}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      title={label}
    >
      {busy ? "✦…" : "✦ IA"}
    </button>
  );
}

function activeToggleButtonClass(active: boolean): string {
  return active
    ? "rounded-xl border border-emerald-400/40 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-500/10 disabled:opacity-50 dark:text-emerald-300"
    : "rounded-xl border border-amber-400/40 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-500/10 disabled:opacity-50 dark:text-amber-300";
}

function activeToggleLabel(active: boolean): string {
  return active ? "ON" : "OFF";
}

export function AdminEntitiesPanel({ initialTab: initialTabOverride }: { initialTab?: Tab } = {}) {
  const [tab, setTab] = useState<Tab>(initialTabOverride ?? initialTab);
  const [platforms, setPlatforms] = useState<PlatformRow[]>([]);
  const [companies, setCompanies] = useState<IndexRow[]>([]);
  const [genres, setGenres] = useState<IndexRow[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<EntitySort>("alpha-asc");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null);
  const [togglingNewsSlug, setTogglingNewsSlug] = useState<string | null>(null);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [companyAiRunning, setCompanyAiRunning] = useState<string | null>(null);
  const [mergeSourceSlug, setMergeSourceSlug] = useState<string | null>(null);
  const [mergeTargetSlug, setMergeTargetSlug] = useState("");
  const [mergingSlug, setMergingSlug] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editNewSlug, setEditNewSlug] = useState("");
  const [editShortName, setEditShortName] = useState("");
  const [editManufacturer, setEditManufacturer] = useState("nintendo");
  const [editStatus, setEditStatus] = useState("closed");
  const [editPlatformNewsEnabled, setEditPlatformNewsEnabled] = useState(false);
  const [editCompanyHistory, setEditCompanyHistory] = useState("");
  const [editCompanyLogoUrl, setEditCompanyLogoUrl] = useState("");
  const [editCompanyWebsiteUrl, setEditCompanyWebsiteUrl] = useState("");
  const [editCompanyFoundedYear, setEditCompanyFoundedYear] = useState("");
  const [editCompanyClosedYear, setEditCompanyClosedYear] = useState("");
  const [editCompanyStatus, setEditCompanyStatus] = useState<"active" | "defunct" | "subsidiary" | "unknown">("unknown");
  const [editParentCompany, setEditParentCompany] = useState("");
  const [editAcquiredByCompany, setEditAcquiredByCompany] = useState("");
  const [editSuccessorCompany, setEditSuccessorCompany] = useState("");
  const [editCompanySeoTitle, setEditCompanySeoTitle] = useState("");
  const [editCompanySeoDescription, setEditCompanySeoDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!initialTabOverride) return;
    setTab(initialTabOverride);
    setSearch("");
    setEditingSlug(null);
    setMergeSourceSlug(null);
    setError(null);
    setMessage(null);
  }, [initialTabOverride]);

  const [platformName, setPlatformName] = useState("");
  const [platformSlug, setPlatformSlug] = useState("");
  const [platformShortName, setPlatformShortName] = useState("");
  const [platformManufacturer, setPlatformManufacturer] = useState("nintendo");
  const [platformStatus, setPlatformStatus] = useState("closed");

  const [companyName, setCompanyName] = useState("");
  const [companySlug, setCompanySlug] = useState("");

  const [genreName, setGenreName] = useState("");
  const [genreSlug, setGenreSlug] = useState("");

  const visiblePlatforms = sortEntities(
    platforms.filter((platform) => matchesSearch(platform, search)),
    sort,
  );
  const visibleCompanies = sortEntities(companies, sort);
  const visibleGenres = sortEntities(genres, sort);

  function relationInputValue(relation: CompanyRelation | null | undefined): string {
    return relation ? `${relation.name} (${relation.slug})` : "";
  }

  function relationFromInput(value: string, currentSlug: string): CompanyRelation | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const slugMatch = trimmed.match(/\(([^()]+)\)\s*$/);
    const typedSlug = slugMatch?.[1]?.trim() ?? trimmed;
    const normalizedSlug = typedSlug.toLowerCase();
    const match = companies.find(
      (company) =>
        company.slug.toLowerCase() === normalizedSlug ||
        company.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (!match || match.slug === currentSlug) return null;
    return { slug: match.slug, name: match.name };
  }

  const loadPlatforms = useCallback(async () => {
    const res = await fetch("/api/admin/entities/platforms");
    const data = await res.json();
    if (res.ok) setPlatforms(data.platforms ?? []);
  }, []);

  const loadCompanies = useCallback(async (q = search) => {
    const params = new URLSearchParams({ limit: "500" });
    if (q.trim()) params.set("q", q.trim());
    const res = await fetch(`/api/admin/entities/companies?${params}`);
    const data = await res.json();
    if (res.ok) setCompanies(data.companies ?? []);
  }, [search]);

  const loadGenres = useCallback(async (q = search) => {
    const params = new URLSearchParams({ limit: "150" });
    if (q.trim()) params.set("q", q.trim());
    const res = await fetch(`/api/admin/entities/genres?${params}`);
    const data = await res.json();
    if (res.ok) setGenres(data.genres ?? []);
  }, [search]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "platforms") await loadPlatforms();
      if (tab === "companies") await loadCompanies();
      if (tab === "genres") await loadGenres();
    } catch {
      setError("No se pudo cargar la lista.");
    } finally {
      setLoading(false);
    }
  }, [tab, loadPlatforms, loadCompanies, loadGenres]);

  useEffect(() => {
    const delay = tab === "platforms" ? 0 : 350;
    const timer = window.setTimeout(() => {
      void reload();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [reload, tab]);

  async function createPlatform(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/entities/platforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: platformName,
          slug: platformSlug || undefined,
          shortName: platformShortName || undefined,
          manufacturer: platformManufacturer,
          status: platformStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo crear la plataforma.");
        return;
      }
      setPlatformName("");
      setPlatformSlug("");
      setPlatformShortName("");
      setMessage(`Plataforma «${data.platform.name}» creada. Entra en la rotación diaria de precios.`);
      await loadPlatforms();
    } catch {
      setError("Error de red.");
    } finally {
      setSaving(false);
    }
  }

  async function createCompany(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/entities/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: companyName,
          slug: companySlug || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo crear la compañía.");
        return;
      }
      setCompanyName("");
      setCompanySlug("");
      setMessage(`Compañía «${data.company.name}» creada.`);
      await loadCompanies("");
      setSearch("");
    } catch {
      setError("Error de red.");
    } finally {
      setSaving(false);
    }
  }

  async function createGenre(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/entities/genres", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: genreName,
          slug: genreSlug || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo crear el género.");
        return;
      }
      setGenreName("");
      setGenreSlug("");
      setMessage(`Género «${data.genre.name}» creado.`);
      await loadGenres("");
      setSearch("");
    } catch {
      setError("Error de red.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntity(kind: EntityTab, slug: string, label: string) {
    if (
      !confirm(
        `¿Eliminar «${label}»? Solo se permite si no tiene juegos asociados. Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }

    setDeletingSlug(slug);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/admin/entities/${kind}/${encodeURIComponent(slug)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo eliminar.");
        return;
      }
      setMessage(`«${label}» eliminado.`);
      await reload();
    } catch {
      setError("Error de red al eliminar.");
    } finally {
      setDeletingSlug(null);
    }
  }

  async function toggleEntity(kind: EntityTab, slug: string, label: string, active: boolean) {
    setTogglingSlug(slug);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/entities/${kind}/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo cambiar el estado.");
        return;
      }
      setMessage(`«${label}» ${!active ? "activado" : "desactivado"}.`);
      await reload();
    } catch {
      setError("Error de red al cambiar el estado.");
    } finally {
      setTogglingSlug(null);
    }
  }

  async function togglePlatformNews(platform: PlatformRow) {
    const nextNewsEnabled = platform.newsEnabled !== true;
    setTogglingNewsSlug(platform.slug);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/entities/platforms/${encodeURIComponent(platform.slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsEnabled: nextNewsEnabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo cambiar noticias.");
        return;
      }
      setMessage(`Noticias de «${platform.name}» ${nextNewsEnabled ? "activadas" : "desactivadas"}.`);
      await loadPlatforms();
    } catch {
      setError("Error de red al cambiar noticias.");
    } finally {
      setTogglingNewsSlug(null);
    }
  }

  function startEditPlatform(platform: PlatformRow) {
    setEditingSlug(platform.slug);
    setMergeSourceSlug(null);
    setEditName(platform.name);
    setEditNewSlug(platform.slug);
    setEditShortName(platform.shortName);
    setEditManufacturer(platform.manufacturer);
    setEditStatus(platform.status);
    setEditPlatformNewsEnabled(platform.newsEnabled === true);
    setError(null);
    setMessage(null);
  }

  function startEditIndex(row: IndexRow) {
    setEditingSlug(row.slug);
    setMergeSourceSlug(null);
    setEditName(row.name);
    setEditNewSlug(row.slug);
    setEditCompanyHistory(row.history ?? "");
    setEditCompanyLogoUrl(row.logoUrl ?? "");
    setEditCompanyWebsiteUrl(row.websiteUrl ?? "");
    setEditCompanyFoundedYear(row.foundedYear != null ? String(row.foundedYear) : "");
    setEditCompanyClosedYear(row.closedYear != null ? String(row.closedYear) : "");
    setEditCompanyStatus(row.status ?? "unknown");
    setEditParentCompany(relationInputValue(row.parentCompany));
    setEditAcquiredByCompany(relationInputValue(row.acquiredByCompany));
    setEditSuccessorCompany(relationInputValue(row.successorCompany));
    setEditCompanySeoTitle(row.seoTitle ?? "");
    setEditCompanySeoDescription(row.seoDescription ?? "");
    setError(null);
    setMessage(null);
  }

  function cancelEdit() {
    setEditingSlug(null);
  }

  function startMergeCompany(company: IndexRow) {
    setEditingSlug(null);
    setMergeSourceSlug(company.slug);
    setMergeTargetSlug("");
    setError(null);
    setMessage(null);
  }

  async function saveEdit(kind: EntityTab, originalSlug: string) {
    setEditSaving(true);
    setError(null);
    setMessage(null);
    try {
      const body =
        kind === "platforms"
          ? {
              name: editName,
              newSlug: editNewSlug !== originalSlug ? editNewSlug : undefined,
              shortName: editShortName,
              manufacturer: editManufacturer,
              status: editStatus,
              newsEnabled: editPlatformNewsEnabled,
            }
          : {
              name: editName,
              newSlug: editNewSlug !== originalSlug ? editNewSlug : undefined,
              ...(kind === "companies"
                ? {
                    history: editCompanyHistory,
                    logoUrl: editCompanyLogoUrl,
                    websiteUrl: editCompanyWebsiteUrl,
                    foundedYear: editCompanyFoundedYear.trim() ? Number(editCompanyFoundedYear) : null,
                    closedYear: editCompanyClosedYear.trim() ? Number(editCompanyClosedYear) : null,
                    status: editCompanyStatus,
                    parentCompany: relationFromInput(editParentCompany, originalSlug),
                    acquiredByCompany: relationFromInput(editAcquiredByCompany, originalSlug),
                    successorCompany: relationFromInput(editSuccessorCompany, originalSlug),
                    seoTitle: editCompanySeoTitle,
                    seoDescription: editCompanySeoDescription,
                  }
                : {}),
            };

      const res = await fetch(
        `/api/admin/entities/${kind}/${encodeURIComponent(originalSlug)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo guardar.");
        return;
      }
      setEditingSlug(null);
      setMessage(`«${editName}» actualizado.`);
      await reload();
    } catch {
      setError("Error de red al guardar.");
    } finally {
      setEditSaving(false);
    }
  }

  async function runCompanyAi(originalSlug: string, targets?: CompanyAiTarget[], label = "compañía") {
    setCompanyAiRunning(targets?.join("+") ?? "all");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/admin/entities/companies/${encodeURIComponent(originalSlug)}/ai-fill`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editName,
            history: editCompanyHistory,
            logoUrl: editCompanyLogoUrl,
            websiteUrl: editCompanyWebsiteUrl,
            foundedYear: editCompanyFoundedYear.trim() ? Number(editCompanyFoundedYear) : null,
            closedYear: editCompanyClosedYear.trim() ? Number(editCompanyClosedYear) : null,
            status: editCompanyStatus,
            seoTitle: editCompanySeoTitle,
            seoDescription: editCompanySeoDescription,
            targets,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo completar la compañía con IA.");
        return;
      }
      const patch = data.patch ?? {};
      if (typeof patch.history === "string") setEditCompanyHistory(patch.history);
      if (typeof patch.logoUrl === "string") setEditCompanyLogoUrl(patch.logoUrl);
      if (typeof patch.websiteUrl === "string") setEditCompanyWebsiteUrl(patch.websiteUrl);
      if (typeof patch.foundedYear === "number") setEditCompanyFoundedYear(String(patch.foundedYear));
      if (patch.foundedYear === null && targets?.includes("years")) setEditCompanyFoundedYear("");
      if (typeof patch.closedYear === "number") setEditCompanyClosedYear(String(patch.closedYear));
      if (patch.closedYear === null && targets?.includes("years")) setEditCompanyClosedYear("");
      if (patch.status === "active" || patch.status === "defunct" || patch.status === "subsidiary" || patch.status === "unknown") {
        setEditCompanyStatus(patch.status);
      }
      if (typeof patch.seoTitle === "string") setEditCompanySeoTitle(patch.seoTitle);
      if (typeof patch.seoDescription === "string") setEditCompanySeoDescription(patch.seoDescription);
      setMessage(`IA aplicada a ${label}. Revisa y guarda.`);
    } catch {
      setError("Error de red al completar la compañía con IA.");
    } finally {
      setCompanyAiRunning(null);
    }
  }

  async function mergeCompany(source: IndexRow) {
    const targetSlug = mergeTargetSlug.trim();
    if (!targetSlug) {
      setError("Elige la compañía destino.");
      return;
    }
    if (targetSlug === source.slug) {
      setError("No puedes fusionar una compañía consigo misma.");
      return;
    }
    const target = companies.find((company) => company.slug === targetSlug);
    const targetLabel = target?.name ?? targetSlug;
    if (
      !confirm(
        `¿Fusionar «${source.name}» dentro de «${targetLabel}»?\n\nLos juegos, aliases y perfiles pasarán al destino. La compañía origen desaparecerá del listado principal y quedará como alias.`,
      )
    ) {
      return;
    }

    setMergingSlug(source.slug);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/entities/companies/${encodeURIComponent(source.slug)}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetSlug }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo fusionar la compañía.");
        return;
      }
      setMergeSourceSlug(null);
      setMergeTargetSlug("");
      setMessage(
        `«${source.name}» fusionada en «${data.targetName ?? targetLabel}». Juegos actualizados: ${data.updatedGames ?? 0}.`,
      );
      await loadCompanies(search);
    } catch {
      setError("Error de red al fusionar compañías.");
    } finally {
      setMergingSlug(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-sky-300/40 bg-sky-100/30 p-2 dark:border-sky-400/20 dark:bg-sky-950/10">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition-all ${
              tab === item.id
                ? "bg-accent text-accent-fg shadow-sm"
                : "text-muted hover:bg-card-hover hover:text-foreground"
            }`}
            onClick={() => {
              setTab(item.id);
              const url = new URL(window.location.href);
              if (item.id === "platforms") {
                url.searchParams.delete("tab");
              } else {
                url.searchParams.set("tab", item.id);
              }
              window.history.replaceState(null, "", url);
              setSearch("");
              setEditingSlug(null);
              setMergeSourceSlug(null);
              setError(null);
              setMessage(null);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "platforms" && (
        <Panel className={adminToneClass("edit")}>
          <PanelTitle eyebrow="Alta rápida">Nueva plataforma</PanelTitle>
          <form onSubmit={createPlatform} className="grid max-w-3xl gap-4 rounded-2xl border border-amber-300/60 bg-amber-100/35 p-4 dark:border-amber-400/25 dark:bg-amber-950/15 md:grid-cols-2">
            <label className="block space-y-1 md:col-span-2">
              <span className="text-[10px] uppercase tracking-wider text-muted">Nombre</span>
              <input
                required
                className="input"
                value={platformName}
                onChange={(e) => setPlatformName(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Slug</span>
              <input
                className="input font-mono text-xs"
                value={platformSlug}
                onChange={(e) => setPlatformSlug(e.target.value)}
                placeholder="Opcional"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Nombre corto</span>
              <input
                className="input"
                value={platformShortName}
                onChange={(e) => setPlatformShortName(e.target.value)}
                placeholder="Opcional"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Fabricante</span>
              <select
                className="input"
                value={platformManufacturer}
                onChange={(e) => setPlatformManufacturer(e.target.value)}
              >
                <option value="nintendo">Nintendo</option>
                <option value="sony">Sony</option>
                <option value="sega">Sega</option>
                <option value="snk">SNK</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Estado</span>
              <select
                className="input"
                value={platformStatus}
                onChange={(e) => setPlatformStatus(e.target.value)}
              >
                <option value="closed">Cerrada</option>
                <option value="semi-closed">Semi-cerrada</option>
              </select>
            </label>
            <div className="md:col-span-2">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Creando…" : "Crear plataforma"}
              </button>
            </div>
          </form>
        </Panel>
      )}

      {tab === "companies" && (
        <Panel className={adminToneClass("edit")}>
          <PanelTitle eyebrow="Alta rápida">Nueva compañía</PanelTitle>
          <form onSubmit={createCompany} className="grid max-w-2xl gap-4 rounded-2xl border border-amber-300/60 bg-amber-100/35 p-4 dark:border-amber-400/25 dark:bg-amber-950/15 md:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Nombre</span>
              <input
                required
                className="input"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Slug</span>
              <input
                className="input font-mono text-xs"
                value={companySlug}
                onChange={(e) => setCompanySlug(e.target.value)}
                placeholder="Opcional"
              />
            </label>
            <div className="md:col-span-2">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Creando…" : "Crear compañía"}
              </button>
            </div>
          </form>
        </Panel>
      )}

      {tab === "genres" && (
        <Panel className={adminToneClass("edit")}>
          <PanelTitle eyebrow="Alta rápida">Nuevo género</PanelTitle>
          <form onSubmit={createGenre} className="grid max-w-2xl gap-4 rounded-2xl border border-amber-300/60 bg-amber-100/35 p-4 dark:border-amber-400/25 dark:bg-amber-950/15 md:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Nombre</span>
              <input
                required
                className="input"
                value={genreName}
                onChange={(e) => setGenreName(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Slug</span>
              <input
                className="input font-mono text-xs"
                value={genreSlug}
                onChange={(e) => setGenreSlug(e.target.value)}
                placeholder="Opcional"
              />
            </label>
            <div className="md:col-span-2">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Creando…" : "Crear género"}
              </button>
            </div>
          </form>
        </Panel>
      )}

      {tab === "series" && <AdminSeriesPanel />}

      {tab !== "series" && (
      <Panel className={adminToneClass("search")}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <PanelTitle>
            {tab === "platforms"
              ? `Plataformas (${visiblePlatforms.length}/${platforms.length})`
              : tab === "companies"
                ? `Compañías (${visibleCompanies.length}/${companies.length})`
                : `Géneros (${visibleGenres.length}/${genres.length})`}
          </PanelTitle>
          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
            <input
              className="input w-full max-w-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o slug…"
            />
            <div className="flex flex-wrap gap-2">
              {sortOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={sort === option.value ? "btn-primary px-3 py-2 text-xs" : "btn-secondary px-3 py-2 text-xs"}
                  onClick={() => setSort(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted">Cargando…</p>
        ) : tab === "platforms" ? (
          <ul className="grid gap-3">
            {visiblePlatforms.map((platform) => (
              <li key={platform.slug} className="rounded-2xl border border-border bg-background/45 p-4 transition hover:border-sky-400/40 hover:bg-card-hover">
                {editingSlug === platform.slug ? (
                  <form
                    className="grid gap-3 rounded-2xl border border-amber-300/60 bg-amber-100/35 p-4 dark:border-amber-400/25 dark:bg-amber-950/15 md:grid-cols-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveEdit("platforms", platform.slug);
                    }}
                  >
                    <label className="block space-y-1 md:col-span-2">
                      <span className="text-[10px] uppercase tracking-wider text-muted">Nombre</span>
                      <input
                        required
                        className="input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted">Slug</span>
                      <input
                        required
                        className="input font-mono text-xs"
                        value={editNewSlug}
                        onChange={(e) => setEditNewSlug(e.target.value)}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted">Nombre corto</span>
                      <input
                        className="input"
                        value={editShortName}
                        onChange={(e) => setEditShortName(e.target.value)}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted">Fabricante</span>
                      <select
                        className="input"
                        value={editManufacturer}
                        onChange={(e) => setEditManufacturer(e.target.value)}
                      >
                        <option value="nintendo">Nintendo</option>
                        <option value="sony">Sony</option>
                        <option value="sega">Sega</option>
                        <option value="snk">SNK</option>
                      </select>
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted">Estado</span>
                      <select
                        className="input"
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value)}
                      >
                        <option value="closed">Cerrada</option>
                        <option value="semi-closed">Semi-cerrada</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-3 rounded-xl border border-border bg-background/40 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={editPlatformNewsEnabled}
                        onChange={(e) => setEditPlatformNewsEnabled(e.target.checked)}
                      />
                      <span>
                        <span className="block text-[10px] uppercase tracking-wider text-muted">
                          Noticias en la página de plataforma
                        </span>
                        <span className="block text-xs text-muted">
                          Si está apagado, no se mostrarán noticias ni se deben lanzar búsquedas para esta sección.
                        </span>
                      </span>
                    </label>
                    <div className="flex flex-wrap gap-2 md:col-span-2">
                      <button type="submit" className="btn-primary" disabled={editSaving}>
                        {editSaving ? "Guardando…" : "Guardar"}
                      </button>
                      <button type="button" className="btn-secondary" onClick={cancelEdit}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/plataforma/${platform.slug}`}
                          className="font-medium text-foreground hover:text-accent"
                          target="_blank"
                        >
                          {platform.name}
                        </Link>
                        <Badge tone="neutral">{platform.shortName}</Badge>
                        <Badge tone={platform.active === false ? "amber" : "green"}>
                          {platform.active === false ? "Pausada" : "Activa"}
                        </Badge>
                        <Badge tone={platform.newsEnabled === true ? "green" : "neutral"}>
                          Noticias {platform.newsEnabled === true ? "ON" : "OFF"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted">
                        {platform.slug} · {platform.manufacturer} · {platform.catalogGames} juegos
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary px-3 py-1.5 text-xs"
                      onClick={() => startEditPlatform(platform)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className={activeToggleButtonClass(platform.active !== false)}
                      disabled={togglingSlug === platform.slug}
                      title={platform.active === false ? "Activar plataforma" : "Desactivar plataforma"}
                      onClick={() =>
                        void toggleEntity("platforms", platform.slug, platform.name, platform.active !== false)
                      }
                    >
                      {togglingSlug === platform.slug
                        ? "Cambiando…"
                        : activeToggleLabel(platform.active !== false)}
                    </button>
                    <button
                      type="button"
                      className={activeToggleButtonClass(platform.newsEnabled === true)}
                      disabled={togglingNewsSlug === platform.slug}
                      title={platform.newsEnabled === true ? "Desactivar noticias" : "Activar noticias"}
                      onClick={() => void togglePlatformNews(platform)}
                    >
                      {togglingNewsSlug === platform.slug
                        ? "Noticias…"
                        : `Noticias ${activeToggleLabel(platform.newsEnabled === true)}`}
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-rose-400/40 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-300"
                      disabled={deletingSlug === platform.slug || platform.catalogGames > 0}
                      title={
                        platform.catalogGames > 0
                          ? "No se puede borrar con juegos en catálogo"
                          : "Eliminar plataforma"
                      }
                      onClick={() => void deleteEntity("platforms", platform.slug, platform.name)}
                    >
                      {deletingSlug === platform.slug ? "Eliminando…" : "Eliminar"}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : tab === "companies" ? (
          <ul className="grid gap-3">
            {visibleCompanies.map((company) => (
              <li key={company.slug} className="rounded-2xl border border-border bg-background/45 p-4 transition hover:border-sky-400/40 hover:bg-card-hover">
                {editingSlug === company.slug ? (
                  <form
                    className="grid gap-3 rounded-2xl border border-amber-300/60 bg-amber-100/35 p-4 dark:border-amber-400/25 dark:bg-amber-950/15 md:grid-cols-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveEdit("companies", company.slug);
                    }}
                  >
                    <label className="block space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted">Nombre</span>
                      <input
                        required
                        className="input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted">Slug</span>
                      <input
                        required
                        className="input font-mono text-xs"
                        value={editNewSlug}
                        onChange={(e) => setEditNewSlug(e.target.value)}
                      />
                    </label>
                    <label className="block space-y-1 md:col-span-2">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-muted">
                          Sobre la compañía
                        </span>
                        <AiMagicButton
                          label="Generar sobre la compañía con IA"
                          busy={companyAiRunning === "history"}
                          disabled={editSaving || Boolean(companyAiRunning)}
                          onClick={() => void runCompanyAi(company.slug, ["history"], "sobre la compañía")}
                        />
                      </span>
                      <textarea
                        className="input min-h-40 leading-7"
                        value={editCompanyHistory}
                        onChange={(e) => setEditCompanyHistory(e.target.value)}
                        placeholder="Texto editorial. Puedes usar varios párrafos; se respetarán los saltos de línea en la ficha pública."
                      />
                      <span className="text-xs text-muted">
                        Este texto alimenta la sección pública “Sobre la compañía”.
                      </span>
                    </label>
                    <label className="block space-y-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-muted">URL logo</span>
                        <AiMagicButton
                          label="Buscar logo con IA"
                          busy={companyAiRunning === "logo"}
                          disabled={editSaving || Boolean(companyAiRunning)}
                          onClick={() => void runCompanyAi(company.slug, ["logo"], "logo")}
                        />
                      </span>
                      <input
                        className="input"
                        value={editCompanyLogoUrl}
                        onChange={(e) => setEditCompanyLogoUrl(e.target.value)}
                        placeholder="https://..."
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-muted">Web oficial</span>
                        <AiMagicButton
                          label="Buscar web oficial con IA"
                          busy={companyAiRunning === "website"}
                          disabled={editSaving || Boolean(companyAiRunning)}
                          onClick={() => void runCompanyAi(company.slug, ["website"], "web oficial")}
                        />
                      </span>
                      <input
                        className="input"
                        value={editCompanyWebsiteUrl}
                        onChange={(e) => setEditCompanyWebsiteUrl(e.target.value)}
                        placeholder="https://..."
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-muted">Estado editorial</span>
                        <AiMagicButton
                          label="Revisar años y estado con IA"
                          busy={companyAiRunning === "years"}
                          disabled={editSaving || Boolean(companyAiRunning)}
                          onClick={() => void runCompanyAi(company.slug, ["years"], "años y estado")}
                        />
                      </span>
                      <select
                        className="input"
                        value={editCompanyStatus}
                        onChange={(e) =>
                          setEditCompanyStatus(e.target.value as "active" | "defunct" | "subsidiary" | "unknown")
                        }
                      >
                        <option value="unknown">Desconocido</option>
                        <option value="active">Activa</option>
                        <option value="defunct">Cerrada</option>
                        <option value="subsidiary">Filial / subsidiaria</option>
                      </select>
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted">Pertenece a / empresa matriz</span>
                      <input
                        className="input"
                        list="admin-company-relation-targets"
                        value={editParentCompany}
                        onChange={(e) => setEditParentCompany(e.target.value)}
                        placeholder="Ej. Take-Two Interactive (take-two-interactive)"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted">Comprada o absorbida por</span>
                      <input
                        className="input"
                        list="admin-company-relation-targets"
                        value={editAcquiredByCompany}
                        onChange={(e) => setEditAcquiredByCompany(e.target.value)}
                        placeholder="Compañía compradora / absorbente"
                      />
                    </label>
                    <label className="block space-y-1 md:col-span-2">
                      <span className="text-[10px] uppercase tracking-wider text-muted">Se convirtió en</span>
                      <input
                        className="input"
                        list="admin-company-relation-targets"
                        value={editSuccessorCompany}
                        onChange={(e) => setEditSuccessorCompany(e.target.value)}
                        placeholder="Nueva compañía o marca sucesora"
                      />
                      <datalist id="admin-company-relation-targets">
                        {companies
                          .filter((target) => target.slug !== company.slug)
                          .map((target) => (
                            <option key={target.slug} value={`${target.name} (${target.slug})`} />
                          ))}
                      </datalist>
                    </label>
                    <label className="block space-y-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-muted">Año fundación</span>
                        <AiMagicButton
                          label="Buscar año de fundación con IA"
                          busy={companyAiRunning === "years"}
                          disabled={editSaving || Boolean(companyAiRunning)}
                          onClick={() => void runCompanyAi(company.slug, ["years"], "años y estado")}
                        />
                      </span>
                      <input
                        className="input"
                        inputMode="numeric"
                        value={editCompanyFoundedYear}
                        onChange={(e) => setEditCompanyFoundedYear(e.target.value)}
                        placeholder="Ej. 1986"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-muted">Año cierre</span>
                        <AiMagicButton
                          label="Buscar año de cierre con IA"
                          busy={companyAiRunning === "years"}
                          disabled={editSaving || Boolean(companyAiRunning)}
                          onClick={() => void runCompanyAi(company.slug, ["years"], "años y estado")}
                        />
                      </span>
                      <input
                        className="input"
                        inputMode="numeric"
                        value={editCompanyClosedYear}
                        onChange={(e) => setEditCompanyClosedYear(e.target.value)}
                        placeholder="Opcional"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-muted">Título SEO</span>
                        <AiMagicButton
                          label="Generar SEO con IA"
                          busy={companyAiRunning === "seo"}
                          disabled={editSaving || Boolean(companyAiRunning)}
                          onClick={() => void runCompanyAi(company.slug, ["seo"], "SEO")}
                        />
                      </span>
                      <input
                        className="input"
                        value={editCompanySeoTitle}
                        onChange={(e) => setEditCompanySeoTitle(e.target.value)}
                        placeholder={`${editName || "Compañía"} · juegos y catálogo | Region Atlas`}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-muted">Descripción SEO</span>
                        <AiMagicButton
                          label="Generar SEO con IA"
                          busy={companyAiRunning === "seo"}
                          disabled={editSaving || Boolean(companyAiRunning)}
                          onClick={() => void runCompanyAi(company.slug, ["seo"], "SEO")}
                        />
                      </span>
                      <textarea
                        className="input min-h-24 leading-6"
                        value={editCompanySeoDescription}
                        onChange={(e) => setEditCompanySeoDescription(e.target.value)}
                        placeholder="Resumen corto para Google y tarjetas sociales."
                      />
                    </label>
                    <div className="flex flex-wrap gap-2 md:col-span-2">
                      <button
                        type="button"
                        className="rounded-xl border border-violet-400/40 bg-violet-500/10 px-4 py-2 text-sm font-semibold text-violet-800 transition hover:bg-violet-500/15 disabled:opacity-50 dark:text-violet-200"
                        disabled={editSaving || Boolean(companyAiRunning)}
                        onClick={() => void runCompanyAi(company.slug)}
                      >
                        {companyAiRunning === "all" ? "IA trabajando…" : "Completar compañía con IA"}
                      </button>
                      <button type="submit" className="btn-primary" disabled={editSaving}>
                        {editSaving ? "Guardando…" : "Guardar"}
                      </button>
                      <button type="button" className="btn-secondary" onClick={cancelEdit}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/compania/${company.slug}`}
                        className="font-medium text-foreground hover:text-accent"
                        target="_blank"
                      >
                        {company.name}
                      </Link>
                      <div className="mt-1">
                        <Badge tone={company.active === false ? "amber" : "green"}>
                          {company.active === false ? "Pausada" : "Activa"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted">
                        {company.slug} · {company.gameCount} juegos
                      </p>
                      {(company.parentCompany || company.acquiredByCompany || company.successorCompany) && (
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-muted">
                          {company.parentCompany && (
                            <span className="rounded-full border border-border bg-background/60 px-2 py-1">
                              Matriz: {company.parentCompany.name}
                            </span>
                          )}
                          {company.acquiredByCompany && (
                            <span className="rounded-full border border-border bg-background/60 px-2 py-1">
                              Comprada por: {company.acquiredByCompany.name}
                            </span>
                          )}
                          {company.successorCompany && (
                            <span className="rounded-full border border-border bg-background/60 px-2 py-1">
                              Se convirtió en: {company.successorCompany.name}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn-secondary px-3 py-1.5 text-xs"
                      onClick={() => startEditIndex(company)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-sky-400/40 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-500/10 disabled:opacity-50 dark:text-sky-300"
                      onClick={() => startMergeCompany(company)}
                    >
                      Fusionar
                    </button>
                    <button
                      type="button"
                      className={activeToggleButtonClass(company.active !== false)}
                      disabled={togglingSlug === company.slug}
                      title={company.active === false ? "Activar compañía" : "Desactivar compañía"}
                      onClick={() =>
                        void toggleEntity("companies", company.slug, company.name, company.active !== false)
                      }
                    >
                      {togglingSlug === company.slug
                        ? "Cambiando…"
                        : activeToggleLabel(company.active !== false)}
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-rose-400/40 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-300"
                      disabled={deletingSlug === company.slug || company.gameCount > 0}
                      title={
                        company.gameCount > 0
                          ? "No se puede borrar con juegos asociados"
                          : "Eliminar compañía"
                      }
                      onClick={() => void deleteEntity("companies", company.slug, company.name)}
                    >
                      {deletingSlug === company.slug ? "Eliminando…" : "Eliminar"}
                    </button>
                  </div>
                  {mergeSourceSlug === company.slug && (
                    <form
                      className="mt-4 grid gap-3 rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-4 md:grid-cols-[1fr_auto_auto]"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void mergeCompany(company);
                      }}
                    >
                      <label className="block space-y-1">
                        <span className="text-[10px] uppercase tracking-wider text-muted">
                          Fusionar dentro de
                        </span>
                        <input
                          required
                          className="input font-mono text-xs"
                          list="admin-company-merge-targets"
                          value={mergeTargetSlug}
                          onChange={(e) => setMergeTargetSlug(e.target.value)}
                          placeholder="slug destino, ej. square-enix"
                        />
                        <datalist id="admin-company-merge-targets">
                          {companies
                            .filter((target) => target.slug !== company.slug)
                            .map((target) => (
                              <option key={target.slug} value={target.slug}>
                                {target.name}
                              </option>
                            ))}
                        </datalist>
                        <span className="text-xs text-muted">
                          Útil para erratas: el origen desaparece y queda como alias del destino.
                        </span>
                      </label>
                      <button
                        type="submit"
                        className="btn-primary self-end px-4 py-2 text-xs"
                        disabled={mergingSlug === company.slug}
                      >
                        {mergingSlug === company.slug ? "Fusionando…" : "Fusionar"}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary self-end px-4 py-2 text-xs"
                        onClick={() => {
                          setMergeSourceSlug(null);
                          setMergeTargetSlug("");
                        }}
                      >
                        Cancelar
                      </button>
                    </form>
                  )}
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <ul className="grid gap-3">
            {visibleGenres.map((genre) => (
              <li key={genre.slug} className="rounded-2xl border border-border bg-background/45 p-4 transition hover:border-sky-400/40 hover:bg-card-hover">
                {editingSlug === genre.slug ? (
                  <form
                    className="grid gap-3 rounded-2xl border border-amber-300/60 bg-amber-100/35 p-4 dark:border-amber-400/25 dark:bg-amber-950/15 md:grid-cols-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveEdit("genres", genre.slug);
                    }}
                  >
                    <label className="block space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted">Nombre</span>
                      <input
                        required
                        className="input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted">Slug</span>
                      <input
                        required
                        className="input font-mono text-xs"
                        value={editNewSlug}
                        onChange={(e) => setEditNewSlug(e.target.value)}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2 md:col-span-2">
                      <button type="submit" className="btn-primary" disabled={editSaving}>
                        {editSaving ? "Guardando…" : "Guardar"}
                      </button>
                      <button type="button" className="btn-secondary" onClick={cancelEdit}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/genero/${genre.slug}`}
                        className="font-medium text-foreground hover:text-accent"
                        target="_blank"
                      >
                        {genre.name}
                      </Link>
                      <div className="mt-1">
                        <Badge tone={genre.active === false ? "amber" : "green"}>
                          {genre.active === false ? "Pausada" : "Activa"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted">
                        {genre.slug} · {genre.gameCount} juegos
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary px-3 py-1.5 text-xs"
                      onClick={() => startEditIndex(genre)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className={activeToggleButtonClass(genre.active !== false)}
                      disabled={togglingSlug === genre.slug}
                      title={genre.active === false ? "Activar género" : "Desactivar género"}
                      onClick={() =>
                        void toggleEntity("genres", genre.slug, genre.name, genre.active !== false)
                      }
                    >
                      {togglingSlug === genre.slug
                        ? "Cambiando…"
                        : activeToggleLabel(genre.active !== false)}
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-rose-400/40 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-300"
                      disabled={deletingSlug === genre.slug || genre.gameCount > 0}
                      title={
                        genre.gameCount > 0 ? "No se puede borrar con juegos asociados" : "Eliminar género"
                      }
                      onClick={() => void deleteEntity("genres", genre.slug, genre.name)}
                    >
                      {deletingSlug === genre.slug ? "Eliminando…" : "Eliminar"}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      )}

      {message && <AdminNotice tone="status">{message}</AdminNotice>}
      {error && <AdminNotice tone="danger">{error}</AdminNotice>}

      <AdminFunctionCard tone="neutral" className="text-xs leading-5 text-muted">
        En local, los cambios se guardan en JSON del proyecto. En producción, las altas rápidas se guardan
        en Blob para que funcionen sin redeploy. Solo puedes borrar entidades sin juegos asociados;
        para recolecciones de precios usa el panel Admin → Precios.
      </AdminFunctionCard>
    </div>
  );
}
