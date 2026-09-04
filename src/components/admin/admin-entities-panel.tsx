"use client";

import Link from "next/link";
import { Database, UsersRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AdminSeriesPanel } from "@/components/admin/admin-series-panel";
import { AdminFranchisesPanel } from "@/components/admin/admin-franchises-panel";
import { AdminFunctionCard, AdminNotice, adminToneClass } from "@/components/admin/admin-visual";
import { Badge, Panel, PanelTitle } from "@/components/ui";

type EntityTab = "platforms" | "companies" | "genres";
type Tab = EntityTab | "franchises" | "series";

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
  isParentCompany?: boolean;
  parentCompany?: CompanyRelation | null;
  acquiredByCompany?: CompanyRelation | null;
  mergedWithCompany?: CompanyRelation | null;
  predecessorCompany?: CompanyRelation | null;
  successorCompany?: CompanyRelation | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
};

type CompanyRelation = {
  slug: string;
  name: string;
};

type EntitySort = "alpha-asc" | "alpha-desc" | "games-desc" | "games-asc";
type CompanyAiTarget = "history" | "logo" | "website" | "years" | "relations" | "seo";
type EntityMode = "create" | "edit" | "delete";

type CompanyDuplicateCandidate = {
  slug: string;
  name: string;
  gameCount: number;
  active?: boolean;
  isParentCompany?: boolean;
  score: number;
  confidence: "alta" | "media" | "baja";
  reasons: string[];
};

const tabs: { id: Tab; label: string }[] = [
  { id: "platforms", label: "Plataformas" },
  { id: "companies", label: "Compañías" },
  { id: "genres", label: "Géneros" },
  { id: "franchises", label: "Franquicias" },
  { id: "series", label: "Sagas / Subseries" },
];

const sortOptions: { value: EntitySort; label: string }[] = [
  { value: "alpha-asc", label: "A-Z" },
  { value: "alpha-desc", label: "Z-A" },
  { value: "games-desc", label: "Más juegos" },
  { value: "games-asc", label: "Menos juegos" },
];

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

function companyRelationLabel(company: Pick<IndexRow, "name" | "slug">): string {
  return `${company.name} (${company.slug})`;
}

function companyRelationBadge(company: IndexRow): string {
  if (company.isParentCompany) return "MADRE";
  if (company.parentCompany) return `HIJA DE ${company.parentCompany.name}`;
  if (company.acquiredByCompany) return `COMPRADA POR ${company.acquiredByCompany.name}`;
  if (company.mergedWithCompany) return `FUSIONADA CON ${company.mergedWithCompany.name}`;
  if (company.successorCompany) return `SE CONVIRTIÓ EN ${company.successorCompany.name}`;
  return "SIN RELACIÓN";
}

export function AdminEntitiesPanel({
  initialTab: initialTabOverride,
  mode = "edit",
  lockTab = false,
}: {
  initialTab?: Tab;
  mode?: EntityMode;
  lockTab?: boolean;
} = {}) {
  const [tab, setTab] = useState<Tab>(initialTabOverride ?? "platforms");
  const [platforms, setPlatforms] = useState<PlatformRow[]>([]);
  const [companies, setCompanies] = useState<IndexRow[]>([]);
  const [genres, setGenres] = useState<IndexRow[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<EntitySort>("alpha-asc");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [companyAiRunning, setCompanyAiRunning] = useState<string | null>(null);
  const [companyDuplicateRunning, setCompanyDuplicateRunning] = useState(false);
  const [companyDuplicateSourceSlug, setCompanyDuplicateSourceSlug] = useState<string | null>(null);
  const [companyDuplicateCandidates, setCompanyDuplicateCandidates] = useState<CompanyDuplicateCandidate[]>([]);
  const [mergeSourceSlug, setMergeSourceSlug] = useState<string | null>(null);
  const [mergeTargetSlug, setMergeTargetSlug] = useState("");
  const [mergingSlug, setMergingSlug] = useState<string | null>(null);
  const [revertingMergeSlug, setRevertingMergeSlug] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editNewSlug, setEditNewSlug] = useState("");
  const [editShortName, setEditShortName] = useState("");
  const [editManufacturer, setEditManufacturer] = useState("nintendo");
  const [editStatus, setEditStatus] = useState("closed");
  const [editCompanyHistory, setEditCompanyHistory] = useState("");
  const [editCompanyLogoUrl, setEditCompanyLogoUrl] = useState("");
  const [editCompanyWebsiteUrl, setEditCompanyWebsiteUrl] = useState("");
  const [editCompanyFoundedYear, setEditCompanyFoundedYear] = useState("");
  const [editCompanyClosedYear, setEditCompanyClosedYear] = useState("");
  const [editCompanyStatus, setEditCompanyStatus] = useState<"active" | "defunct" | "subsidiary" | "unknown">("unknown");
  const [editCompanyIsParent, setEditCompanyIsParent] = useState(false);
  const [editParentCompany, setEditParentCompany] = useState("");
  const [editAcquiredByCompany, setEditAcquiredByCompany] = useState("");
  const [editMergedWithCompany, setEditMergedWithCompany] = useState("");
  const [editPredecessorCompany, setEditPredecessorCompany] = useState("");
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
  const [platformDescription, setPlatformDescription] = useState("");
  const [platformSortOrder, setPlatformSortOrder] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [companySlug, setCompanySlug] = useState("");
  const [companyHistory, setCompanyHistory] = useState("");
  const [companyLogoUrl, setCompanyLogoUrl] = useState("");
  const [companyWebsiteUrl, setCompanyWebsiteUrl] = useState("");
  const [companyFoundedYear, setCompanyFoundedYear] = useState("");
  const [companyClosedYear, setCompanyClosedYear] = useState("");
  const [companyStatus, setCompanyStatus] = useState<"active" | "defunct" | "subsidiary" | "unknown">("unknown");
  const [companyIsParent, setCompanyIsParent] = useState(false);
  const [companyParent, setCompanyParent] = useState("");
  const [companyAcquiredBy, setCompanyAcquiredBy] = useState("");
  const [companyMergedWith, setCompanyMergedWith] = useState("");
  const [companyPredecessor, setCompanyPredecessor] = useState("");
  const [companySuccessor, setCompanySuccessor] = useState("");
  const [companySeoTitle, setCompanySeoTitle] = useState("");
  const [companySeoDescription, setCompanySeoDescription] = useState("");
  const [companyAutoAi, setCompanyAutoAi] = useState(false);

  const [genreName, setGenreName] = useState("");
  const [genreSlug, setGenreSlug] = useState("");

  const visiblePlatforms = sortEntities(
    platforms.filter((platform) => matchesSearch(platform, search)),
    sort,
  );
  const visibleCompanies = sortEntities(
    companies.filter((company) => matchesSearch(company, search)),
    sort,
  );
  const visibleGenres = sortEntities(
    genres.filter((genre) => matchesSearch(genre, search)),
    sort,
  );
  const showCreatePanel = !lockTab || mode === "create";
  const showListPanel = !lockTab || mode !== "create";

  function relationInputValue(relation: CompanyRelation | null | undefined): string {
    return relation ? `${relation.name} (${relation.slug})` : "";
  }

  function relationFromInput(value: string, currentSlug: string): CompanyRelation | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const slugMatch = trimmed.match(/\(([^()]+)\)\s*$/);
    const typedSlug = slugMatch?.[1]?.trim() ?? trimmed;
    const normalizedSlug = typedSlug
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const typedName = slugMatch ? trimmed.replace(/\s*\([^()]+\)\s*$/, "").trim() : trimmed;
    const match = companies.find(
      (company) =>
        company.slug.toLowerCase() === normalizedSlug ||
        company.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (match?.slug === currentSlug) return null;
    if (match) return { slug: match.slug, name: match.name };
    if (!normalizedSlug || normalizedSlug === currentSlug) return null;
    return { slug: normalizedSlug, name: typedName || normalizedSlug };
  }

  function applyCompanyAiPatch(patch: Record<string, unknown>, targets?: CompanyAiTarget[]) {
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
    if (patch.parentCompany !== undefined) setEditParentCompany(relationInputValue(patch.parentCompany as CompanyRelation | null));
    if (patch.acquiredByCompany !== undefined) setEditAcquiredByCompany(relationInputValue(patch.acquiredByCompany as CompanyRelation | null));
    if (patch.mergedWithCompany !== undefined) setEditMergedWithCompany(relationInputValue(patch.mergedWithCompany as CompanyRelation | null));
    if (patch.predecessorCompany !== undefined) setEditPredecessorCompany(relationInputValue(patch.predecessorCompany as CompanyRelation | null));
    if (patch.successorCompany !== undefined) setEditSuccessorCompany(relationInputValue(patch.successorCompany as CompanyRelation | null));
    if (typeof patch.seoTitle === "string") setEditCompanySeoTitle(patch.seoTitle);
    if (typeof patch.seoDescription === "string") setEditCompanySeoDescription(patch.seoDescription);
  }

  const loadPlatforms = useCallback(async () => {
    const res = await fetch("/api/admin/entities/platforms");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "No se pudieron cargar las plataformas.");
    if (res.ok) setPlatforms(data.platforms ?? []);
  }, []);

  const loadCompanies = useCallback(async () => {
    const params = new URLSearchParams({ limit: "5000" });
    const res = await fetch(`/api/admin/entities/companies?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "No se pudieron cargar las compañías.");
    if (res.ok) setCompanies(data.companies ?? []);
  }, []);

  const loadGenres = useCallback(async (q = search) => {
    const params = new URLSearchParams({ limit: "150" });
    if (q.trim()) params.set("q", q.trim());
    const res = await fetch(`/api/admin/entities/genres?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "No se pudieron cargar los géneros.");
    if (res.ok) setGenres(data.genres ?? []);
  }, [search]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "platforms") await loadPlatforms();
      if (tab === "companies") await loadCompanies();
      if (tab === "genres") await loadGenres();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la lista.");
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
          description: platformDescription || undefined,
          sortOrder: platformSortOrder ? Number.parseInt(platformSortOrder, 10) : undefined,
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
      setPlatformDescription("");
      setPlatformSortOrder("");
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
          history: companyHistory || null,
          logoUrl: companyLogoUrl || null,
          websiteUrl: companyWebsiteUrl || null,
          foundedYear: companyFoundedYear ? Number.parseInt(companyFoundedYear, 10) : null,
          closedYear: companyClosedYear ? Number.parseInt(companyClosedYear, 10) : null,
          status: companyStatus,
          isParentCompany: companyIsParent,
          parentCompany: relationFromInput(companyParent, companySlug || ""),
          acquiredByCompany: relationFromInput(companyAcquiredBy, companySlug || ""),
          mergedWithCompany: relationFromInput(companyMergedWith, companySlug || ""),
          predecessorCompany: relationFromInput(companyPredecessor, companySlug || ""),
          successorCompany: relationFromInput(companySuccessor, companySlug || ""),
          seoTitle: companySeoTitle || null,
          seoDescription: companySeoDescription || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo crear la compañía.");
        return;
      }
      const createdSlug = data.company.slug as string;
      const createdName = data.company.name as string;
      const createdStatus = companyStatus;
      const createdIsParentCompany = companyIsParent;
      const createdParentCompany = relationFromInput(companyParent, createdSlug);
      const createdAcquiredByCompany = relationFromInput(companyAcquiredBy, createdSlug);
      const createdMergedWithCompany = relationFromInput(companyMergedWith, createdSlug);
      const createdPredecessorCompany = relationFromInput(companyPredecessor, createdSlug);
      const createdSuccessorCompany = relationFromInput(companySuccessor, createdSlug);

      setEditingSlug(createdSlug);
      setMergeSourceSlug(null);
      setEditName(createdName);
      setEditNewSlug(createdSlug);
      setEditCompanyHistory(companyHistory);
      setEditCompanyLogoUrl(companyLogoUrl);
      setEditCompanyWebsiteUrl(companyWebsiteUrl);
      setEditCompanyFoundedYear(companyFoundedYear);
      setEditCompanyClosedYear(companyClosedYear);
      setEditCompanyStatus(createdStatus);
      setEditCompanyIsParent(createdIsParentCompany);
      setEditParentCompany(relationInputValue(createdParentCompany));
      setEditAcquiredByCompany(relationInputValue(createdAcquiredByCompany));
      setEditMergedWithCompany(relationInputValue(createdMergedWithCompany));
      setEditPredecessorCompany(relationInputValue(createdPredecessorCompany));
      setEditSuccessorCompany(relationInputValue(createdSuccessorCompany));
      setEditCompanySeoTitle(companySeoTitle);
      setEditCompanySeoDescription(companySeoDescription);

      setCompanyName("");
      setCompanySlug("");
      setCompanyHistory("");
      setCompanyLogoUrl("");
      setCompanyWebsiteUrl("");
      setCompanyFoundedYear("");
      setCompanyClosedYear("");
      setCompanyStatus("unknown");
      setCompanyIsParent(false);
      setCompanyParent("");
      setCompanyAcquiredBy("");
      setCompanyMergedWith("");
      setCompanyPredecessor("");
      setCompanySuccessor("");
      setCompanySeoTitle("");
      setCompanySeoDescription("");
      await loadCompanies();
      setSearch("");
      if (companyAutoAi) {
        setCompanyAiRunning("all");
        setMessage(`Compañía «${createdName}» creada. IA completando huecos…`);
        const aiRes = await fetch(
          `/api/admin/entities/companies/${encodeURIComponent(createdSlug)}/ai-fill`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: createdName,
              history: companyHistory,
              logoUrl: companyLogoUrl,
              websiteUrl: companyWebsiteUrl,
              foundedYear: companyFoundedYear ? Number.parseInt(companyFoundedYear, 10) : null,
              closedYear: companyClosedYear ? Number.parseInt(companyClosedYear, 10) : null,
              status: createdStatus,
              isParentCompany: createdIsParentCompany,
              parentCompany: createdParentCompany,
              acquiredByCompany: createdAcquiredByCompany,
              mergedWithCompany: createdMergedWithCompany,
              predecessorCompany: createdPredecessorCompany,
              successorCompany: createdSuccessorCompany,
              seoTitle: companySeoTitle,
              seoDescription: companySeoDescription,
            }),
          },
        );
        const aiData = await aiRes.json();
        if (!aiRes.ok) {
          setError(aiData.error ?? "Compañía creada, pero la IA no pudo completar huecos.");
          setMessage(`Compañía «${createdName}» creada. Revisa el editor abierto.`);
          return;
        }
        applyCompanyAiPatch(aiData.patch ?? {});
        setMessage(`Compañía «${createdName}» creada y completada con IA. Revisa y guarda.`);
      } else {
        setMessage(`Compañía «${createdName}» creada. Editor abierto para revisar.`);
      }
    } catch {
      setError("Error de red.");
    } finally {
      setCompanyAiRunning(null);
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

  function startEditPlatform(platform: PlatformRow) {
    setEditingSlug(platform.slug);
    setMergeSourceSlug(null);
    setEditName(platform.name);
    setEditNewSlug(platform.slug);
    setEditShortName(platform.shortName);
    setEditManufacturer(platform.manufacturer);
    setEditStatus(platform.status);
    setError(null);
    setMessage(null);
  }

  function startEditIndex(row: IndexRow) {
    setEditingSlug(row.slug);
    setMergeSourceSlug(null);
    setCompanyDuplicateSourceSlug(null);
    setCompanyDuplicateCandidates([]);
    setEditName(row.name);
    setEditNewSlug(row.slug);
    setEditCompanyHistory(row.history ?? "");
    setEditCompanyLogoUrl(row.logoUrl ?? "");
    setEditCompanyWebsiteUrl(row.websiteUrl ?? "");
    setEditCompanyFoundedYear(row.foundedYear != null ? String(row.foundedYear) : "");
    setEditCompanyClosedYear(row.closedYear != null ? String(row.closedYear) : "");
    setEditCompanyStatus(row.status ?? "unknown");
    setEditCompanyIsParent(row.isParentCompany === true);
    setEditParentCompany(relationInputValue(row.parentCompany));
    setEditAcquiredByCompany(relationInputValue(row.acquiredByCompany));
    setEditMergedWithCompany(relationInputValue(row.mergedWithCompany));
    setEditPredecessorCompany(relationInputValue(row.predecessorCompany));
    setEditSuccessorCompany(relationInputValue(row.successorCompany));
    setEditCompanySeoTitle(row.seoTitle ?? "");
    setEditCompanySeoDescription(row.seoDescription ?? "");
    setError(null);
    setMessage(null);
  }

  function cancelEdit() {
    setEditingSlug(null);
    setCompanyDuplicateSourceSlug(null);
    setCompanyDuplicateCandidates([]);
  }

  function startMergeCompany(company: IndexRow) {
    setEditingSlug(null);
    setCompanyDuplicateSourceSlug(null);
    setCompanyDuplicateCandidates([]);
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
                    isParentCompany: editCompanyIsParent,
                    parentCompany: relationFromInput(editParentCompany, originalSlug),
                    acquiredByCompany: relationFromInput(editAcquiredByCompany, originalSlug),
                    mergedWithCompany: relationFromInput(editMergedWithCompany, originalSlug),
                    predecessorCompany: relationFromInput(editPredecessorCompany, originalSlug),
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
            isParentCompany: editCompanyIsParent,
            parentCompany: relationFromInput(editParentCompany, originalSlug),
            acquiredByCompany: relationFromInput(editAcquiredByCompany, originalSlug),
            mergedWithCompany: relationFromInput(editMergedWithCompany, originalSlug),
            predecessorCompany: relationFromInput(editPredecessorCompany, originalSlug),
            successorCompany: relationFromInput(editSuccessorCompany, originalSlug),
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
      applyCompanyAiPatch(patch, targets);
      setMessage(`IA aplicada a ${label}. Revisa y guarda.`);
    } catch {
      setError("Error de red al completar la compañía con IA.");
    } finally {
      setCompanyAiRunning(null);
    }
  }

  async function runCompanyDuplicateScan(originalSlug: string) {
    setCompanyDuplicateRunning(true);
    setCompanyDuplicateSourceSlug(originalSlug);
    setCompanyDuplicateCandidates([]);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/admin/entities/companies/${encodeURIComponent(originalSlug)}/duplicates?limit=12`,
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudieron buscar posibles duplicadas.");
        return;
      }
      setCompanyDuplicateCandidates(data.candidates ?? []);
      setMessage(
        (data.candidates ?? []).length
          ? `Radar de duplicadas: ${(data.candidates ?? []).length} posibles coincidencias.`
          : "Radar de duplicadas: no hay sospechosas sin controlar.",
      );
    } catch {
      setError("Error de red al buscar posibles duplicadas.");
    } finally {
      setCompanyDuplicateRunning(false);
    }
  }

  async function patchCompanyRelation(
    slug: string,
    patch: {
      isParentCompany?: boolean;
      parentCompany?: CompanyRelation | null;
      acquiredByCompany?: CompanyRelation | null;
      mergedWithCompany?: CompanyRelation | null;
      predecessorCompany?: CompanyRelation | null;
      successorCompany?: CompanyRelation | null;
      status?: "active" | "defunct" | "subsidiary" | "unknown";
    },
    successMessage: string,
  ) {
    const company = companies.find((item) => item.slug === slug);
    setEditSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/entities/companies/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: company?.name,
          ...patch,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo actualizar la relación corporativa.");
        return;
      }
      setMessage(successMessage);
      await loadCompanies();
    } catch {
      setError("Error de red al actualizar la relación corporativa.");
    } finally {
      setEditSaving(false);
    }
  }

  async function linkCompanyAsChild(parent: IndexRow, child: IndexRow) {
    if (
      !confirm(
        `¿Relacionar «${child.name}» como hija/subsidiaria de «${parent.name}»?\n\nEsto no mueve juegos ni elimina fichas: solo crea el árbol corporativo.`,
      )
    ) {
      return;
    }
    if (!parent.isParentCompany) {
      await patchCompanyRelation(
        parent.slug,
        { isParentCompany: true },
        `«${parent.name}» marcada como empresa madre.`,
      );
      if (parent.slug === editingSlug) setEditCompanyIsParent(true);
    }
    await patchCompanyRelation(
      child.slug,
      { parentCompany: { slug: parent.slug, name: parent.name }, status: "subsidiary" },
      `«${child.name}» vinculada como hija de «${parent.name}».`,
    );
  }

  function recommendedMergeTarget(source: IndexRow, candidate: IndexRow): IndexRow {
    if (source.isParentCompany && !candidate.isParentCompany) return source;
    if (candidate.isParentCompany && !source.isParentCompany) return candidate;
    const sourceParent = source.parentCompany
      ? companies.find((company) => company.slug === source.parentCompany?.slug)
      : null;
    const candidateParent = candidate.parentCompany
      ? companies.find((company) => company.slug === candidate.parentCompany?.slug)
      : null;
    if (sourceParent?.isParentCompany) return sourceParent;
    if (candidateParent?.isParentCompany) return candidateParent;
    return source;
  }

  async function mergeCompany(source: IndexRow, targetSlugOverride?: string) {
    const targetSlug = (targetSlugOverride ?? mergeTargetSlug).trim();
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
    const protectionNotice =
      source.isParentCompany && !target?.isParentCompany
        ? "\n\nOjo: el origen está marcado como empresa madre. El sistema invertirá la fusión para conservar esa ficha y absorber la otra."
        : target?.isParentCompany
          ? "\n\nLa ficha destino está marcada como empresa madre y quedará protegida."
          : source.isParentCompany && target?.isParentCompany
            ? "\n\nAmbas están marcadas como empresa madre; el sistema bloqueará la fusión."
            : "";
    if (
      !confirm(
        `¿Fusionar «${source.name}» dentro de «${targetLabel}»?\n\nLos juegos, aliases y perfiles pasarán al destino. La compañía origen desaparecerá del listado principal y quedará como alias.${protectionNotice}`,
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
        data.protectedParentCompany
          ? `Fusión protegida: se conservó la ficha madre «${data.targetName ?? targetLabel}». Juegos actualizados: ${data.updatedGames ?? 0}.`
          : `«${source.name}» fusionada en «${data.targetName ?? targetLabel}». Juegos actualizados: ${data.updatedGames ?? 0}.`,
      );
      await loadCompanies();
    } catch {
      setError("Error de red al fusionar compañías.");
    } finally {
      setMergingSlug(null);
    }
  }

  async function revertCompanyMerge(target: IndexRow) {
    if (
      !confirm(
        `¿Deshacer la última fusión aplicada sobre «${target.name}»?\n\nSe restaurará la compañía origen, sus juegos volverán a apuntar a ella y se recuperarán los datos previos guardados en el registro.`,
      )
    ) {
      return;
    }

    setRevertingMergeSlug(target.slug);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/admin/entities/companies/${encodeURIComponent(target.slug)}/merge/revert`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo deshacer la fusión.");
        return;
      }
      setMergeSourceSlug(null);
      setMergeTargetSlug("");
      setMessage(
        `Fusión deshecha: «${data.sourceName}» vuelve a estar separada de «${data.targetName}». Fichas restauradas: ${data.restoredGames ?? 0}.`,
      );
      await loadCompanies();
    } catch {
      setError("Error de red al deshacer la fusión.");
    } finally {
      setRevertingMergeSlug(null);
    }
  }

  return (
    <div className="space-y-6">
      {!lockTab ? (
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
      ) : null}

      {showCreatePanel && tab === "platforms" && (
        <Panel className={adminToneClass("edit")}>
          <PanelTitle eyebrow="Alta completa">Nueva plataforma</PanelTitle>
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
                <option value="microsoft">Microsoft</option>
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
                <option value="open">Abierta</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Orden</span>
              <input
                className="input"
                type="number"
                value={platformSortOrder}
                onChange={(e) => setPlatformSortOrder(e.target.value)}
                placeholder="Opcional"
              />
            </label>
            <label className="block space-y-1 md:col-span-2">
              <span className="text-[10px] uppercase tracking-wider text-muted">Descripción</span>
              <textarea
                className="input min-h-28"
                value={platformDescription}
                onChange={(e) => setPlatformDescription(e.target.value)}
                placeholder="Descripción pública o nota interna de la plataforma."
              />
            </label>
            <div className="md:col-span-2">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Creando…" : "Crear plataforma"}
              </button>
            </div>
          </form>
        </Panel>
      )}

      {showCreatePanel && tab === "companies" && (
        <Panel className={adminToneClass("edit")}>
          <PanelTitle eyebrow="Alta completa">Nueva compañía</PanelTitle>
          <form onSubmit={createCompany} className="grid max-w-5xl gap-4 rounded-2xl border border-amber-300/60 bg-amber-100/35 p-4 dark:border-amber-400/25 dark:bg-amber-950/15 md:grid-cols-2">
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
            <label className="block space-y-1 md:col-span-2">
              <span className="text-[10px] uppercase tracking-wider text-muted">Sobre la compañía</span>
              <textarea
                className="input min-h-36 leading-7"
                value={companyHistory}
                onChange={(e) => setCompanyHistory(e.target.value)}
                placeholder="Historia o descripción editorial de la compañía."
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">URL logo</span>
              <input
                className="input"
                value={companyLogoUrl}
                onChange={(e) => setCompanyLogoUrl(e.target.value)}
                placeholder="https://..."
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Web oficial</span>
              <input
                className="input"
                value={companyWebsiteUrl}
                onChange={(e) => setCompanyWebsiteUrl(e.target.value)}
                placeholder="https://..."
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Estado editorial</span>
              <select
                className="input"
                value={companyStatus}
                onChange={(e) =>
                  setCompanyStatus(e.target.value as "active" | "defunct" | "subsidiary" | "unknown")
                }
              >
                <option value="unknown">Desconocido</option>
                <option value="active">Activa</option>
                <option value="defunct">Cerrada</option>
                <option value="subsidiary">Filial / subsidiaria</option>
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-amber-300/60 bg-amber-50/70 p-3 text-sm dark:border-amber-400/30 dark:bg-amber-950/20">
              <input
                type="checkbox"
                checked={companyIsParent}
                onChange={(e) => setCompanyIsParent(e.target.checked)}
              />
              <span>
                <span className="block font-semibold text-foreground">Empresa madre protegida</span>
                <span className="text-xs text-muted">
                  Si se fusiona por error, esta ficha permanece y absorbe a la otra.
                </span>
              </span>
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Año fundación</span>
              <input
                className="input"
                type="number"
                min={1800}
                max={2100}
                value={companyFoundedYear}
                onChange={(e) => setCompanyFoundedYear(e.target.value)}
                placeholder="Ej. 1986"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Año cierre</span>
              <input
                className="input"
                type="number"
                min={1800}
                max={2100}
                value={companyClosedYear}
                onChange={(e) => setCompanyClosedYear(e.target.value)}
                placeholder="Opcional"
              />
            </label>
            <div className="rounded-2xl border border-emerald-400/35 bg-emerald-500/10 p-4 md:col-span-2">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-800 dark:text-emerald-200">
                Árbol corporativo
              </p>
              <p className="mt-1 text-sm text-muted">
                Relaciona filiales, compras, fusiones o cambios de nombre sin mover juegos. La fusión real se hace desde edición.
              </p>
            </div>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Pertenece a / empresa matriz</span>
              <input
                className="input"
                list="admin-new-company-relation-targets"
                value={companyParent}
                onChange={(e) => setCompanyParent(e.target.value)}
                placeholder="Ej. Take-Two Interactive"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Comprada o absorbida por</span>
              <input
                className="input"
                list="admin-new-company-relation-targets"
                value={companyAcquiredBy}
                onChange={(e) => setCompanyAcquiredBy(e.target.value)}
                placeholder="Compañía compradora / absorbente"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Fusionada con</span>
              <input
                className="input"
                list="admin-new-company-relation-targets"
                value={companyMergedWith}
                onChange={(e) => setCompanyMergedWith(e.target.value)}
                placeholder="Compañía con la que se fusionó"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Viene de / predecesora</span>
              <input
                className="input"
                list="admin-new-company-relation-targets"
                value={companyPredecessor}
                onChange={(e) => setCompanyPredecessor(e.target.value)}
                placeholder="Compañía anterior"
              />
            </label>
            <label className="block space-y-1 md:col-span-2">
              <span className="text-[10px] uppercase tracking-wider text-muted">Se convirtió en</span>
              <input
                className="input"
                list="admin-new-company-relation-targets"
                value={companySuccessor}
                onChange={(e) => setCompanySuccessor(e.target.value)}
                placeholder="Nueva compañía o marca sucesora"
              />
              <datalist id="admin-new-company-relation-targets">
                {companies.map((target) => (
                  <option key={target.slug} value={`${target.name} (${target.slug})`} />
                ))}
              </datalist>
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Título SEO</span>
              <input
                className="input"
                value={companySeoTitle}
                onChange={(e) => setCompanySeoTitle(e.target.value)}
                placeholder="Opcional"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Descripción SEO</span>
              <textarea
                className="input min-h-28"
                value={companySeoDescription}
                onChange={(e) => setCompanySeoDescription(e.target.value)}
                placeholder="Opcional"
              />
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-border bg-card/70 p-3 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={companyAutoAi}
                onChange={(e) => setCompanyAutoAi(e.target.checked)}
              />
              <span>
                <span className="block font-medium text-foreground">
                  Crear compañía y completar huecos con IA en el editor
                </span>
                <span className="text-xs text-muted">
                  Respeta los campos que ya hayas rellenado y solo intenta completar lo que falte.
                </span>
              </span>
            </label>
            <div className="md:col-span-2">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving
                  ? companyAiRunning === "all"
                    ? "IA completando…"
                    : "Creando…"
                  : companyAutoAi
                    ? "Crear compañía y completar huecos con IA en el editor"
                    : "Crear compañía"}
              </button>
            </div>
          </form>
        </Panel>
      )}

      {showCreatePanel && tab === "genres" && (
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

      {tab === "series" && <AdminSeriesPanel mode={mode} lockTab={lockTab} />}
      {tab === "franchises" && <AdminFranchisesPanel />}

      {showListPanel && tab !== "series" && tab !== "franchises" && (
      <Panel className={adminToneClass("search")}>
        <div className="mb-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <PanelTitle>
              {tab === "platforms"
                ? `Plataformas (${visiblePlatforms.length}/${platforms.length})`
                : tab === "companies"
                  ? `Compañías (${visibleCompanies.length}/${companies.length})`
                  : `Géneros (${visibleGenres.length}/${genres.length})`}
            </PanelTitle>
            {tab === "companies" && (
              <div className="flex flex-wrap gap-2">
                <Link href="/admin/entidades/investigacion" className="btn-secondary gap-2 px-3 py-2 text-xs">
                  <Database className="h-4 w-4" aria-hidden="true" />
                  Investigación
                </Link>
                <Link href="/admin/entidades/personas" className="btn-secondary gap-2 px-3 py-2 text-xs">
                  <UsersRound className="h-4 w-4" aria-hidden="true" />
                  Personas
                </Link>
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-background/45 p-4">
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Buscar</span>
              <input
                className="input w-full"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o slug…"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
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
                        <option value="microsoft">Microsoft</option>
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
                        <option value="open">Abierta</option>
                      </select>
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
                    <label className="flex items-center gap-3 rounded-xl border border-amber-300/60 bg-amber-50/70 p-3 text-sm dark:border-amber-400/30 dark:bg-amber-950/20">
                      <input
                        type="checkbox"
                        checked={editCompanyIsParent}
                        onChange={(e) => setEditCompanyIsParent(e.target.checked)}
                      />
                      <span>
                        <span className="block font-semibold text-foreground">Empresa madre protegida</span>
                        <span className="text-xs text-muted">
                          Esta ficha gana siempre ante fusiones accidentales en sentido inverso.
                        </span>
                      </span>
                    </label>
                    <label className="block space-y-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-muted">Pertenece a / empresa matriz</span>
                        <AiMagicButton
                          label="Buscar relaciones corporativas con IA"
                          busy={companyAiRunning === "relations"}
                          disabled={editSaving || Boolean(companyAiRunning)}
                          onClick={() => void runCompanyAi(company.slug, ["relations"], "relaciones corporativas")}
                        />
                      </span>
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
                    <label className="block space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted">Fusionada con</span>
                      <input
                        className="input"
                        list="admin-company-relation-targets"
                        value={editMergedWithCompany}
                        onChange={(e) => setEditMergedWithCompany(e.target.value)}
                        placeholder="Compañía con la que se fusionó"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted">Viene de / predecesora</span>
                      <input
                        className="input"
                        list="admin-company-relation-targets"
                        value={editPredecessorCompany}
                        onChange={(e) => setEditPredecessorCompany(e.target.value)}
                        placeholder="Compañía anterior"
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
                    <div className="rounded-2xl border border-emerald-400/35 bg-emerald-500/10 p-4 md:col-span-2">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-800 dark:text-emerald-200">
                            Árbol corporativo
                          </p>
                          <p className="mt-1 text-sm text-muted">
                            Relacionar no mueve juegos; fusionar sí mueve juegos y aliases. Las fichas madre quedan protegidas.
                          </p>
                        </div>
                        {editCompanyIsParent || company.isParentCompany ? (
                          <span className="rounded-full border border-amber-400/60 bg-amber-300/20 px-3 py-1 text-xs font-black uppercase tracking-wider text-amber-800 dark:text-amber-200">
                            Madre protegida
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-4 grid gap-2">
                        {companies.filter((candidate) => candidate.parentCompany?.slug === company.slug).length ? (
                          companies
                            .filter((candidate) => candidate.parentCompany?.slug === company.slug)
                            .map((child) => (
                              <div
                                key={child.slug}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/70 p-3"
                              >
                                <div>
                                  <Link
                                    href={`/compania/${child.slug}`}
                                    className="font-semibold text-foreground hover:text-accent"
                                    target="_blank"
                                  >
                                    {child.name}
                                  </Link>
                                  <p className="text-xs text-muted">
                                    {child.slug} · {child.gameCount} juegos · hija/subsidiaria
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  className="rounded-xl border border-rose-400/40 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-300"
                                  disabled={editSaving}
                                  onClick={() =>
                                    void patchCompanyRelation(
                                      child.slug,
                                      { parentCompany: null },
                                      `«${child.name}» ya no cuelga de «${company.name}».`,
                                    )
                                  }
                                >
                                  Quitar de esta madre
                                </button>
                              </div>
                            ))
                        ) : (
                          <div className="rounded-xl border border-border bg-background/60 p-3 text-sm text-muted">
                            Aún no hay hijas vinculadas a esta ficha. Usa el radar de duplicadas o el buscador de matriz para relacionarlas.
                          </div>
                        )}
                      </div>
                    </div>
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
                    <div className="rounded-2xl border border-sky-400/35 bg-sky-500/10 p-4 md:col-span-2">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-700 dark:text-sky-200">
                            Radar de duplicadas
                          </p>
                          <p className="mt-1 text-sm text-muted">
                            Busca compañías parecidas que aún no estén controladas como madre, hija, sucesora o fusionada.
                          </p>
                        </div>
                        <button
                          type="button"
                          className="rounded-xl border border-sky-400/50 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-800 transition hover:bg-sky-500/15 disabled:opacity-50 dark:text-sky-200"
                          disabled={companyDuplicateRunning}
                          onClick={() => void runCompanyDuplicateScan(company.slug)}
                        >
                          {companyDuplicateRunning && companyDuplicateSourceSlug === company.slug
                            ? "Buscando…"
                            : "Buscar repetidas"}
                        </button>
                      </div>
                      {companyDuplicateSourceSlug === company.slug && (
                        <div className="mt-4 grid gap-2">
                          {companyDuplicateCandidates.length === 0 && !companyDuplicateRunning ? (
                            <div className="rounded-xl border border-border bg-background/60 p-3 text-sm text-muted">
                              No hay posibles duplicadas sin controlar para esta compañía.
                            </div>
                          ) : (
                            companyDuplicateCandidates.map((candidate) => {
                              const candidateRow =
                                companies.find((item) => item.slug === candidate.slug) ??
                                ({
                                  slug: candidate.slug,
                                  name: candidate.name,
                                  gameCount: candidate.gameCount,
                                  active: candidate.active,
                                  isParentCompany: candidate.isParentCompany,
                                } satisfies IndexRow);
                              const mergeTarget = recommendedMergeTarget(company, candidateRow);
                              const mergeSource = mergeTarget.slug === company.slug ? candidateRow : company;
                              return (
                                <div
                                  key={candidate.slug}
                                  className="grid gap-3 rounded-xl border border-border bg-background/70 p-3 lg:grid-cols-[1fr_auto]"
                                >
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-semibold text-foreground">{candidate.name}</span>
                                      <span
                                        className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                                          candidateRow.isParentCompany
                                            ? "border-amber-400/60 bg-amber-300/20 text-amber-800 dark:text-amber-200"
                                            : candidateRow.parentCompany
                                              ? "border-emerald-400/50 bg-emerald-300/15 text-emerald-800 dark:text-emerald-200"
                                              : "border-slate-400/40 bg-slate-300/10 text-muted"
                                        }`}
                                      >
                                        {companyRelationBadge(candidateRow)}
                                      </span>
                                      <span className="rounded-full border border-sky-400/40 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-sky-700 dark:text-sky-200">
                                        {candidate.confidence}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-xs text-muted">
                                      {candidate.slug} · {candidate.gameCount} juegos · score {candidate.score}
                                    </p>
                                    {candidate.reasons.length > 0 && (
                                      <p className="mt-1 text-xs text-muted">
                                        {candidate.reasons.join(" · ")}
                                      </p>
                                    )}
                                    <p className="mt-2 text-xs text-muted">
                                      Destino de fusión recomendado:{" "}
                                      <strong className="text-foreground">{mergeTarget.name}</strong>
                                      {mergeTarget.isParentCompany ? " · ficha madre protegida" : ""}
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                                    <Link
                                      href={`/compania/${candidate.slug}`}
                                      className="btn-secondary px-3 py-2 text-xs"
                                      target="_blank"
                                    >
                                      Ver ficha
                                    </Link>
                                    <button
                                      type="button"
                                      className="rounded-xl border border-emerald-400/40 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-500/10 dark:text-emerald-300"
                                      disabled={editSaving}
                                      onClick={() => void linkCompanyAsChild(company, candidateRow)}
                                    >
                                      Relacionar hija
                                    </button>
                                    <button
                                      type="button"
                                      className="rounded-xl border border-amber-400/40 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-500/10 dark:text-amber-300"
                                      onClick={() => setEditParentCompany(companyRelationLabel(candidateRow))}
                                    >
                                      Usar como matriz
                                    </button>
                                    <button
                                      type="button"
                                      className="rounded-xl border border-violet-400/40 px-3 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-500/10 dark:text-violet-300"
                                      onClick={() => setEditMergedWithCompany(companyRelationLabel(candidateRow))}
                                    >
                                      Historia: fusionada
                                    </button>
                                    <button
                                      type="button"
                                      className="rounded-xl border border-sky-400/40 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-500/10 disabled:opacity-50 dark:text-sky-300"
                                      disabled={
                                        mergingSlug === mergeSource.slug ||
                                        (company.isParentCompany === true && candidateRow.isParentCompany === true)
                                      }
                                      onClick={() => void mergeCompany(mergeSource, mergeTarget.slug)}
                                    >
                                      {company.isParentCompany === true && candidateRow.isParentCompany === true
                                        ? "Dos madres"
                                        : `Fusionar en ${mergeTarget.name}`}
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
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
                        {company.isParentCompany && (
                          <span className="ml-2 rounded-full border border-amber-400/60 bg-amber-300/20 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-200">
                            Madre
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted">
                        {company.slug} · {company.gameCount} juegos
                      </p>
                      {(company.parentCompany ||
                        company.acquiredByCompany ||
                        company.mergedWithCompany ||
                        company.predecessorCompany ||
                        company.successorCompany) && (
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
                          {company.mergedWithCompany && (
                            <span className="rounded-full border border-border bg-background/60 px-2 py-1">
                              Fusionada con: {company.mergedWithCompany.name}
                            </span>
                          )}
                          {company.predecessorCompany && (
                            <span className="rounded-full border border-border bg-background/60 px-2 py-1">
                              Viene de: {company.predecessorCompany.name}
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
                      className="rounded-xl border border-amber-400/40 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-500/10 disabled:opacity-50 dark:text-amber-300"
                      disabled={revertingMergeSlug === company.slug}
                      onClick={() => void revertCompanyMerge(company)}
                    >
                      {revertingMergeSlug === company.slug ? "Restaurando…" : "Deshacer fusión"}
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
                              <option
                                key={target.slug}
                                value={target.slug}
                                label={`${target.name}${target.isParentCompany ? " · MADRE" : ""}`}
                              />
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
