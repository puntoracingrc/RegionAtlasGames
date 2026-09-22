"use client";

import { Plus, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Panel, PanelTitle } from "@/components/ui";
import { adminToneClass } from "@/components/admin/admin-visual";
import { attemptOptionalImageUpload } from "@/lib/admin-optional-image-upload";
import { buildAdminVariantImageSlug } from "@/lib/admin-regional-variant-batch";

type PlatformOption = { slug: string; name: string };
type MarketOption = { value: string; label: string; shortLabel: string; flagCode: string; group: string; broadRegion: string };
type PriceFields = {
  estimatedPriceLoose: string;
  estimatedPriceGameManual: string;
  estimatedPriceComplete: string;
  estimatedPriceSealed: string;
  estimatedPriceNewRetail: string;
};
type ImageRole = "front" | "back" | "spine" | "contents";
type ImageEvidenceType = "REAL_SCAN" | "REAL_PHOTO" | "RETAILER_ASSET" | "PUBLISHER_MOCKUP" | "OWNER_CONFIRMATION";
type VariantGroup = {
  id: number;
  label: string;
  markets: string[];
  barcode: string;
  productCodes: string;
  packagingLanguages: string;
  softwareLanguages: string;
  confidence: "CONFIRMED" | "PENDING_IDENTIFIER";
  ratingSystems: string;
  catalogNumber: string;
  serial: string;
  boxCode: string;
  releaseDate: string;
  releaseDateContext: string;
  physicalContentStatus: string;
  physicalProductType: string;
  physicalContents: string;
  digitalContents: string;
  widthCm: string;
  heightCm: string;
  depthCm: string;
  notes: string;
  imageEvidenceType: ImageEvidenceType;
  files: Partial<Record<ImageRole, File>>;
  marketPrices: Record<string, PriceFields>;
  existingCatalogIds: Record<string, string>;
};

const MARKET_GROUP_LABELS: Record<string, string> = {
  europe: "Europa", america: "América", asia: "Asia", oceania: "Oceanía",
  "middle-east": "Oriente Medio", africa: "África",
};
const IMAGE_ROLE_LABELS: Record<ImageRole, string> = {
  front: "Portada", back: "Contraportada", spine: "Lomo", contents: "Contenido / desplegable",
};
const EMPTY_PRICES: PriceFields = {
  estimatedPriceLoose: "", estimatedPriceGameManual: "", estimatedPriceComplete: "",
  estimatedPriceSealed: "", estimatedPriceNewRetail: "",
};

function emptyGroup(id: number): VariantGroup {
  return {
    id, label: "", markets: [], barcode: "", productCodes: "", packagingLanguages: "", softwareLanguages: "",
    confidence: "PENDING_IDENTIFIER", ratingSystems: "",
    catalogNumber: "", serial: "", boxCode: "", releaseDate: "", releaseDateContext: "",
    physicalContentStatus: "PHYSICAL_FULL_GAME", physicalProductType: "NATIVE_GAME_DISC",
    physicalContents: "Caja, Juego", digitalContents: "", widthCm: "", heightCm: "",
    depthCm: "", notes: "", imageEvidenceType: "RETAILER_ASSET", files: {}, marketPrices: {},
    existingCatalogIds: {},
  };
}

function splitValues(value: string): string[] {
  return value.split(/[,;/]/).map((item) => item.trim()).filter(Boolean);
}
function slugPart(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}
function pricePayload(prices: PriceFields) {
  return Object.fromEntries(Object.entries(prices).map(([key, value]) => [key, numberOrNull(value)]));
}

function TextField({ label, value, onChange, className = "", placeholder }: {
  label: string; value: string; onChange: (value: string) => void; className?: string; placeholder?: string;
}) {
  return <label className={`block space-y-1 ${className}`}>
    <span className="text-[10px] uppercase tracking-wider text-muted">{label}</span>
    <input className="input" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
  </label>;
}

function FileField({ label, file, onChange }: { label: string; file?: File; onChange: (file: File | undefined) => void }) {
  return <label className="block space-y-1">
    <span className="text-[10px] uppercase tracking-wider text-muted">{label}</span>
    <span className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted">
      <Upload size={16} aria-hidden="true" />
      <span className="min-w-0 truncate">{file?.name ?? "Seleccionar imagen"}</span>
      <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => onChange(event.target.files?.[0])} />
    </span>
  </label>;
}

export function AdminRegionalVariantBatchForm({ platforms, marketOptions }: { platforms: PlatformOption[]; marketOptions: MarketOption[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [platformSlug, setPlatformSlug] = useState(platforms.find((platform) => platform.slug === "ps5")?.slug ?? platforms[0]?.slug ?? "ps5");
  const [physicalVariant, setPhysicalVariant] = useState("Standard");
  const [baseSlug, setBaseSlug] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [commonCoverFile, setCommonCoverFile] = useState<File>();
  const [year, setYear] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [pegi, setPegi] = useState("");
  const [players, setPlayers] = useState("");
  const [support, setSupport] = useState("");
  const [developerName, setDeveloperName] = useState("");
  const [publisherName, setPublisherName] = useState("");
  const [genreNames, setGenreNames] = useState("");
  const [subgenreNames, setSubgenreNames] = useState("");
  const [facetNames, setFacetNames] = useState("");
  const [description, setDescription] = useState("");
  const [groups, setGroups] = useState<VariantGroup[]>([emptyGroup(1)]);
  const [nextId, setNextId] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<{ physicalVariantCount: number; regionalRecordCount: number } | null>(null);

  const marketByValue = useMemo(() => new Map(marketOptions.map((option) => [option.value, option])), [marketOptions]);
  const marketsByGroup = useMemo(() => {
    const entries = new Map<string, MarketOption[]>();
    for (const option of marketOptions) entries.set(option.group, [...(entries.get(option.group) ?? []), option]);
    return [...entries.entries()];
  }, [marketOptions]);
  const regionalRecordCount = groups.reduce((total, group) => total + group.markets.length, 0);
  const canSubmit = Boolean(title.trim()) && groups.every((group) => group.markets.length > 0);

  function updateGroup(id: number, patch: Partial<VariantGroup>) {
    setGroups((current) => current.map((group) => group.id === id ? { ...group, ...patch } : group));
  }
  function toggleMarket(group: VariantGroup, value: string) {
    const active = group.markets.includes(value);
    const markets = active ? group.markets.filter((market) => market !== value) : [...group.markets, value];
    const marketPrices = { ...group.marketPrices };
    const existingCatalogIds = { ...group.existingCatalogIds };
    if (active) {
      delete marketPrices[value];
      delete existingCatalogIds[value];
    } else {
      marketPrices[value] = { ...EMPTY_PRICES };
      existingCatalogIds[value] = "";
    }
    updateGroup(group.id, { markets, marketPrices, existingCatalogIds });
  }
  function updateMarketPrice(group: VariantGroup, market: string, key: keyof PriceFields, value: string) {
    updateGroup(group.id, { marketPrices: { ...group.marketPrices, [market]: { ...(group.marketPrices[market] ?? EMPTY_PRICES), [key]: value } } });
  }
  async function uploadImage(file: File, targetSlug: string) {
    const form = new FormData();
    form.set("file", file); form.set("platformSlug", platformSlug); form.set("targetSlug", targetSlug);
    const response = await fetch("/api/admin/games/batch/image", { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? `No se pudo subir ${file.name}.`);
    return data as { url: string; width: number; height: number };
  }

  async function submit(publishNow: boolean) {
    setLoading(true); setError(null); setUploadWarnings([]); setResult(null);
    try {
      const slugSeed = slugPart(baseSlug || title) || `juego-${Date.now()}`;
      const warnings: string[] = [];
      const commonCoverAttempt = commonCoverFile
        ? await attemptOptionalImageUpload("Portada común pendiente", () =>
            uploadImage(commonCoverFile, `${slugSeed}-portada-comun`))
        : { value: null, warning: null };
      if (commonCoverAttempt.warning) warnings.push(commonCoverAttempt.warning);
      const uploadedCommonCover = commonCoverAttempt.value;
      const preparedGroups = [];
      for (const [index, group] of groups.entries()) {
        const imageAttempts = [];
        for (const [role, file] of Object.entries(group.files) as Array<[ImageRole, File]>) {
          const key = buildAdminVariantImageSlug({
            titleSlug: slugSeed,
            platformSlug,
            markets: group.markets,
            groupLabel: group.label,
            physicalVariant,
            role,
          });
          imageAttempts.push(await attemptOptionalImageUpload(
            `${IMAGE_ROLE_LABELS[role]} de ${group.label || `caja ${index + 1}`} pendiente`,
            async () => {
              const uploaded = await uploadImage(file, key);
              return { key, placement: role === "contents" ? "CONTENTS" : "GALLERY", url: uploaded.url, thumbnailUrl: uploaded.url, width: uploaded.width, height: uploaded.height, caption: IMAGE_ROLE_LABELS[role], evidenceType: group.imageEvidenceType };
            },
          ));
        }
        const imageEntries = imageAttempts.flatMap((attempt) => attempt.value ? [attempt.value] : []);
        warnings.push(...imageAttempts.flatMap((attempt) => attempt.warning ? [attempt.warning] : []));
        const front = imageEntries.find((image) => image.key.endsWith("-front"));
        const dimensions = group.widthCm && group.heightCm && group.depthCm ? {
          widthCm: numberOrNull(group.widthCm), heightCm: numberOrNull(group.heightCm), depthCm: numberOrNull(group.depthCm),
          approximate: true, sourceLabel: "Alta manual de Region Atlas", notes: [],
        } : undefined;
        preparedGroups.push({
          label: group.label || undefined, markets: group.markets, barcode: group.barcode || null,
          productCodes: splitValues(group.productCodes), packagingLanguages: splitValues(group.packagingLanguages),
          softwareLanguages: splitValues(group.softwareLanguages), confidence: group.confidence,
          coverUrl: front?.url ?? uploadedCommonCover?.url ?? (coverUrl || null),
          ratingSystems: splitValues(group.ratingSystems), physicalContentStatus: group.physicalContentStatus,
          catalogNumber: group.catalogNumber || null, serial: group.serial || null, boxCode: group.boxCode || null,
          releaseDate: group.releaseDate || null, releaseDateContext: group.releaseDateContext || null,
          physicalProductType: group.physicalProductType, physicalContents: splitValues(group.physicalContents),
          digitalContents: splitValues(group.digitalContents), dimensions, images: imageEntries, notes: splitValues(group.notes),
          marketPrices: Object.fromEntries(group.markets.map((market) => [market, pricePayload(group.marketPrices[market] ?? EMPTY_PRICES)])),
          existingCatalogIds: Object.fromEntries(group.markets.map((market) => [market, group.existingCatalogIds[market] ?? ""])),
        });
      }
      const response = await fetch("/api/admin/games/batch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, platformSlug, physicalVariant, baseSlug: baseSlug || undefined,
          coverUrl: uploadedCommonCover?.url ?? (coverUrl || null), year: year || null, releaseDate: releaseDate || null,
          pegi: pegi || null, players: players || null, support: support || null, developerName: developerName || null,
          publisherName: publisherName || null, genreNames: splitValues(genreNames), subgenreNames: splitValues(subgenreNames),
          facetNames: splitValues(facetNames), description: description || null, publishNow, groups: preparedGroups }),
      });
      const data = await response.json();
      setUploadWarnings(warnings);
      if (!response.ok) { setError(data.error ?? "No se pudo crear el lote."); return; }
      setResult({ physicalVariantCount: data.physicalVariantCount, regionalRecordCount: data.regionalRecordCount });
      if (data.redirect) router.push(data.redirect);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error de red al guardar el lote.");
    } finally { setLoading(false); }
  }

  return <Panel className={adminToneClass("edit")}>
    <PanelTitle eyebrow="Alta regional V2">Juego y variantes físicas</PanelTitle>
    <p className="mb-5 max-w-4xl text-sm leading-6 text-muted">Completa el juego una vez, documenta cada caja física y añade precios distintos por mercado. El catálogo mostrará una sola ficha central V2 para esta edición, con todas sus cajas y regiones dentro.</p>

    <section className="rounded-lg border border-border bg-background/45 p-4">
      <h2 className="text-base font-semibold">Datos comunes del juego</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <TextField label="Título" value={title} onChange={setTitle} className="lg:col-span-2" />
        <label className="block space-y-1"><span className="text-[10px] uppercase tracking-wider text-muted">Plataforma</span><select className="input" value={platformSlug} onChange={(event) => setPlatformSlug(event.target.value)}>{platforms.map((platform) => <option key={platform.slug} value={platform.slug}>{platform.name}</option>)}</select></label>
        <TextField label="Edición física" value={physicalVariant} onChange={setPhysicalVariant} />
        <FileField label="Subir portada común" file={commonCoverFile} onChange={setCommonCoverFile} />
        <TextField label="URL portada (alternativa)" value={coverUrl} onChange={setCoverUrl} />
        <TextField label="Slug base" value={baseSlug} onChange={setBaseSlug} placeholder="mortal-shell-ii" />
        <TextField label="Año" value={year} onChange={setYear} />
        <TextField label="Fecha de lanzamiento" value={releaseDate} onChange={setReleaseDate} placeholder="2026-08-20" />
        <TextField label="PEGI" value={pegi} onChange={setPegi} placeholder="18" />
        <TextField label="Jugadores" value={players} onChange={setPlayers} placeholder="1" />
        <TextField label="Soporte" value={support} onChange={setSupport} placeholder="Disco Blu-ray" />
        <TextField label="Desarrolladora" value={developerName} onChange={setDeveloperName} />
        <TextField label="Editora" value={publisherName} onChange={setPublisherName} />
        <TextField label="Géneros" value={genreNames} onChange={setGenreNames} placeholder="Acción, RPG" />
        <TextField label="Subgéneros" value={subgenreNames} onChange={setSubgenreNames} />
        <TextField label="Facetas" value={facetNames} onChange={setFacetNames} className="lg:col-span-2" />
        <label className="block space-y-1 md:col-span-2 lg:col-span-4"><span className="text-[10px] uppercase tracking-wider text-muted">Descripción</span><textarea className="input min-h-28" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      </div>
    </section>

    <div className="mt-5 space-y-4">{groups.map((group, groupIndex) => {
      const automaticLabel = group.markets.map((market) => marketByValue.get(market)?.shortLabel).filter(Boolean).join("/");
      return <section key={group.id} className="rounded-lg border border-border bg-background/55 p-4">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-semibold">Caja física {groupIndex + 1}</h2><p className="mt-1 text-xs text-muted">Nombre automático: {automaticLabel || "selecciona mercados"}</p></div>{groups.length > 1 ? <button type="button" className="icon-btn" title="Eliminar caja física" onClick={() => setGroups((current) => current.filter((item) => item.id !== group.id))}><Trash2 size={18} aria-hidden="true" /><span className="sr-only">Eliminar caja física</span></button> : null}</div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <TextField label="Nombre personalizado (opcional)" value={group.label} onChange={(value) => updateGroup(group.id, { label: value })} placeholder={automaticLabel || "US/CA"} />
          <TextField label="EAN / UPC / JAN" value={group.barcode} onChange={(value) => updateGroup(group.id, { barcode: value, confidence: value.trim() ? "CONFIRMED" : "PENDING_IDENTIFIER" })} />
          <TextField label="Códigos de producto" value={group.productCodes} onChange={(value) => updateGroup(group.id, { productCodes: value })} />
          <TextField label="Idiomas de caja" value={group.packagingLanguages} onChange={(value) => updateGroup(group.id, { packagingLanguages: value })} />
          <TextField label="Idiomas del software" value={group.softwareLanguages} onChange={(value) => updateGroup(group.id, { softwareLanguages: value })} />
          <TextField label="Clasificaciones impresas" value={group.ratingSystems} onChange={(value) => updateGroup(group.id, { ratingSystems: value })} placeholder="PEGI 18, ESRB M" />
          <TextField label="Referencia del soporte" value={group.catalogNumber} onChange={(value) => updateGroup(group.id, { catalogNumber: value })} />
          <TextField label="Serial" value={group.serial} onChange={(value) => updateGroup(group.id, { serial: value })} />
          <TextField label="Código de caja" value={group.boxCode} onChange={(value) => updateGroup(group.id, { boxCode: value })} />
          <TextField label="Fecha de esta caja" value={group.releaseDate} onChange={(value) => updateGroup(group.id, { releaseDate: value })} placeholder="2026-08-20" />
          <TextField label="Contexto de la fecha" value={group.releaseDateContext} onChange={(value) => updateGroup(group.id, { releaseDateContext: value })} className="lg:col-span-2" placeholder="Lanzamiento comercial en España" />
          <label className="block space-y-1"><span className="text-[10px] uppercase tracking-wider text-muted">Estado físico</span><select className="input" value={group.physicalContentStatus} onChange={(event) => updateGroup(group.id, { physicalContentStatus: event.target.value })}><option value="PHYSICAL_FULL_GAME">Juego físico completo</option><option value="PHYSICAL_DOWNLOAD_REQUIRED">Descarga adicional necesaria</option><option value="GAME_KEY_CARD">Game-Key Card</option><option value="CODE_IN_BOX">Código en caja</option><option value="COLLECTOR_WITHOUT_GAME">Coleccionista sin juego</option><option value="PROMOTIONAL_NOT_FOR_RESALE">Promocional / NFR</option><option value="UNKNOWN_PHYSICAL_STATUS">Estado físico pendiente</option></select></label>
          <label className="block space-y-1"><span className="text-[10px] uppercase tracking-wider text-muted">Tipo de soporte físico</span><select className="input" value={group.physicalProductType} onChange={(event) => updateGroup(group.id, { physicalProductType: event.target.value })}><option value="NATIVE_GAME_DISC">Disco nativo</option><option value="NATIVE_GAME_CARD">Tarjeta/cartucho nativo</option><option value="GAME_KEY_CARD">Game-Key Card</option><option value="PREVIOUS_GEN_DISC_WITH_UPGRADE">Disco generación anterior + mejora</option><option value="DOWNLOAD_CODE_IN_BOX">Código de descarga</option><option value="UNKNOWN_PHYSICAL_PRODUCT">Pendiente de identificar</option></select></label>
          <label className="block space-y-1"><span className="text-[10px] uppercase tracking-wider text-muted">Estado de identificación</span><select className="input" value={group.confidence} onChange={(event) => updateGroup(group.id, { confidence: event.target.value as VariantGroup["confidence"] })}><option value="CONFIRMED">Variante confirmada</option><option value="PENDING_IDENTIFIER">Confirmada, identificador pendiente</option></select></label>
          <TextField label="Contenido físico" value={group.physicalContents} onChange={(value) => updateGroup(group.id, { physicalContents: value })} className="lg:col-span-2" placeholder="Caja, Juego, Manual" />
          <TextField label="Contenido digital" value={group.digitalContents} onChange={(value) => updateGroup(group.id, { digitalContents: value })} className="lg:col-span-2" />
          <TextField label="Ancho (cm)" value={group.widthCm} onChange={(value) => updateGroup(group.id, { widthCm: value })} />
          <TextField label="Alto (cm)" value={group.heightCm} onChange={(value) => updateGroup(group.id, { heightCm: value })} />
          <TextField label="Profundidad (cm)" value={group.depthCm} onChange={(value) => updateGroup(group.id, { depthCm: value })} />
          <TextField label="Notas documentales" value={group.notes} onChange={(value) => updateGroup(group.id, { notes: value })} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{(Object.keys(IMAGE_ROLE_LABELS) as ImageRole[]).map((role) => <FileField key={role} label={IMAGE_ROLE_LABELS[role]} file={group.files[role]} onChange={(file) => updateGroup(group.id, { files: { ...group.files, [role]: file } })} />)}</div>
        <label className="mt-3 block max-w-sm space-y-1"><span className="text-[10px] uppercase tracking-wider text-muted">Procedencia de las imágenes</span><select className="input" value={group.imageEvidenceType} onChange={(event) => updateGroup(group.id, { imageEvidenceType: event.target.value as ImageEvidenceType })}><option value="RETAILER_ASSET">Imagen de tienda/distribuidor</option><option value="PUBLISHER_MOCKUP">Imagen oficial del editor</option><option value="REAL_SCAN">Escaneo de la caja real</option><option value="REAL_PHOTO">Fotografía de la caja real</option><option value="OWNER_CONFIRMATION">Confirmación del propietario</option></select></label>
        <div className="mt-5 space-y-3">{marketsByGroup.map(([marketGroup, options]) => <fieldset key={marketGroup}><legend className="mb-2 text-xs font-semibold text-muted">{MARKET_GROUP_LABELS[marketGroup] ?? marketGroup}</legend><div className="flex flex-wrap gap-2">{options.map((option) => {
          const active = group.markets.includes(option.value);
          return <label key={option.value} className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${active ? "border-accent bg-accent/10 text-foreground" : "border-border bg-background text-muted"}`}><input type="checkbox" className="sr-only" checked={active} onChange={() => toggleMarket(group, option.value)} />{option.label}</label>;
        })}</div></fieldset>)}</div>
        {group.markets.length > 0 ? <details className="mt-5 rounded-md border border-border bg-background/55 p-3" open><summary className="cursor-pointer text-sm font-semibold">Ficha y precios por región</summary><div className="mt-3 space-y-4">{group.markets.map((market) => {
          const prices = group.marketPrices[market] ?? EMPTY_PRICES;
          return <section key={market} className="rounded-md border border-border p-3"><h3 className="text-sm font-semibold">{marketByValue.get(market)?.label ?? market}</h3><div className="mt-3 max-w-xl"><TextField label="Ficha existente (opcional)" value={group.existingCatalogIds[market] ?? ""} onChange={(value) => updateGroup(group.id, { existingCatalogIds: { ...group.existingCatalogIds, [market]: value } })} placeholder="ps3-007-quantum-of-solace" /></div><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{([
            ["estimatedPriceLoose", "Solo juego"], ["estimatedPriceGameManual", "Juego + manual"], ["estimatedPriceComplete", "Completo"], ["estimatedPriceSealed", "Precintado"], ["estimatedPriceNewRetail", "Nuevo en tienda"],
          ] as Array<[keyof PriceFields, string]>).map(([key, label]) => <label key={key} className="block space-y-1"><span className="text-[10px] uppercase tracking-wider text-muted">{label}</span><input type="number" min="0" step="0.01" className="input" value={prices[key]} onChange={(event) => updateMarketPrice(group, market, key, event.target.value)} placeholder="€" /></label>)}</div></section>;
        })}</div></details> : null}
      </section>;
    })}</div>
    <button type="button" className="btn-secondary mt-4" onClick={() => { setGroups((current) => [...current, emptyGroup(nextId)]); setNextId((current) => current + 1); }}><Plus size={18} aria-hidden="true" /> Añadir caja física</button>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5"><p className="text-sm text-muted"><strong className="text-foreground">1</strong> ficha central V2 · <strong className="text-foreground">{groups.length}</strong> cajas físicas · <strong className="text-foreground">{regionalRecordCount}</strong> identidades regionales</p><div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" disabled={loading || !canSubmit} onClick={() => void submit(false)}>{loading ? "Guardando y subiendo imágenes…" : "Crear lote para revisar"}</button><button type="button" className="btn-primary" disabled={loading || !canSubmit} onClick={() => void submit(true)}>{loading ? "Publicando…" : "Crear y publicar ficha V2"}</button></div></div>
    {error ? <p className="mt-4 rounded-md border border-danger/35 bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}
    {result ? <p className="mt-4 rounded-md border border-success/35 bg-success/10 p-3 text-sm text-foreground">Ficha central creada con {result.physicalVariantCount} cajas físicas y {result.regionalRecordCount} identidades regionales.</p> : null}
    {uploadWarnings.length > 0 ? <div className="mt-4 rounded-md border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-foreground"><p className="font-semibold">La ficha se guardó sin bloquearse; estas imágenes quedan pendientes:</p><ul className="mt-2 list-disc space-y-1 pl-5">{uploadWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
  </Panel>;
}
