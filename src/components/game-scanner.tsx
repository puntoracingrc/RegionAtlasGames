"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Camera, Download, ExternalLink, Eye, FolderOpen, LoaderCircle, ScanLine, Trash2, X } from "lucide-react";
import { SCANNER_COMPONENT_LABELS, SCANNER_MAX_HINT, SCANNER_MAX_PHOTOS, SCANNER_SKIP_LABELS, type ScannerResult } from "@/lib/game-scanner";
import { prepareScannerPhoto } from "@/lib/scanner-photo-client";
import { prefersNativeCamera } from "@/lib/scanner-camera-client";
import { ScannerCamera } from "@/components/scanner-camera";
import { SCANNER_DEFAULT_MODEL, SCANNER_MODELS, SCANNER_MODEL_PRICING_DATE, SCANNER_MODEL_PRICING_URL, scannerModel, type ScannerModelId } from "@/lib/scanner-models";

type Photo = { file: File; url: string; id: string };
type Availability = { authenticated: boolean; available: boolean; remaining: number | null; models: ScannerModelId[] };
type Platform = { slug: string; name: string; manufacturer: string };
const field = "w-full rounded-md border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-2 focus:outline-accent disabled:opacity-60";
const command = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium transition hover:bg-card-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

function ResultEvidence({ result, evidence }: { result: ScannerResult; evidence: { observationIds: string[]; sourceIds: string[] } }) {
  const photos = [...new Set(evidence.observationIds.map((id) => result.perception.observations.find((o) => o.id === id)?.photo).filter(Boolean))];
  return <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
    {photos.map((photo) => <span key={photo}>Foto {photo}</span>)}
    {evidence.sourceIds.map((id) => { const source = result.sources.find((s) => s.id === id); return source ? <a key={id} href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent underline">Fuente documental<ExternalLink className="h-3 w-3" /></a> : null; })}
  </div>;
}

export function GameScanner({ platforms }: { platforms: Platform[] }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const photoRef = useRef<Photo[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const preparingRef = useRef(false);
  const mounted = useRef(true);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [platform, setPlatform] = useState("");
  const [hint, setHint] = useState("");
  const [model, setModel] = useState<ScannerModelId>(SCANNER_DEFAULT_MODEL);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [result, setResult] = useState<ScannerResult | null>(null);
  const [analyses, setAnalyses] = useState<ScannerResult[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const locked = busy || preparing;
  const modelProfile = scannerModel(model)!;
  const allowedModels = availability?.models ?? [SCANNER_DEFAULT_MODEL];

  function clearAnalyses() { setResult(null); setAnalyses([]); }

  async function refreshAvailability() {
    const response = await fetch("/api/scanner", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo consultar la disponibilidad.");
    setAvailability(data);
  }
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    fetch("/api/scanner", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo consultar la disponibilidad.");
      setAvailability(data);
    }).catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => { mounted.current = false; controller.abort(); for (const photo of photoRef.current) URL.revokeObjectURL(photo.url); };
  }, []);
  useEffect(() => { if (selectedPhoto) dialog.current?.showModal(); }, [selectedPhoto]);

  function replacePhotos(next: Photo[]) {
    photoRef.current = next;
    setPhotos(next);
    clearAnalyses();
  }
  async function addPhotos(files: FileList | File[]) {
    const inputs = Array.from(files);
    if (fileInput.current) fileInput.current.value = "";
    if (cameraInput.current) cameraInput.current.value = "";
    if (locked || preparingRef.current || !inputs.length) return false;
    if (photoRef.current.length + inputs.length > SCANNER_MAX_PHOTOS) { setError("Puedes añadir hasta seis fotos."); return false; }
    preparingRef.current = true;
    setPreparing(true);
    setError("");
    const added: Photo[] = [];
    try {
      for (const file of inputs) {
        const prepared = await prepareScannerPhoto(file);
        if (!mounted.current) throw new Error("Vista cerrada");
        added.push({ file: prepared, url: URL.createObjectURL(prepared), id: crypto.randomUUID() });
      }
      replacePhotos([...photoRef.current, ...added]);
      return true;
    } catch (error) {
      for (const photo of added) URL.revokeObjectURL(photo.url);
      if (mounted.current) setError(error instanceof Error ? error.message : "No se pudieron preparar las fotos.");
      return false;
    } finally { preparingRef.current = false; if (mounted.current) setPreparing(false); }
  }
  function openCamera() {
    if (prefersNativeCamera(navigator.userAgent, navigator.maxTouchPoints)) cameraInput.current?.click();
    else setCameraOpen(true);
  }
  function emptyPhotos() {
    for (const photo of photoRef.current) URL.revokeObjectURL(photo.url);
    photoRef.current = []; setPhotos([]); setSelectedPhoto(null); setError("");
  }
  function removePhoto(id: string) {
    const photo = photos.find((photo) => photo.id === id);
    if (photo) URL.revokeObjectURL(photo.url);
    replacePhotos(photos.filter((photo) => photo.id !== id));
  }
  async function scan(event: React.FormEvent) {
    event.preventDefault();
    if (locked || !photos.length || !platform) return;
    setBusy(true); setError("");
    try {
      const body = new FormData();
      body.set("platform", platform); body.set("hint", hint);
      body.set("model", model);
      for (const photo of photos) body.append("photos", photo.file);
      const response = await fetch("/api/scanner", { method: "POST", body, signal: AbortSignal.timeout(245_000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo completar el escaneo.");
      setResult(data.result);
      setAnalyses((previous) => [...previous.filter((item) => item.inputFingerprint === data.result.inputFingerprint).slice(-9), data.result]);
      setAvailability((current) => current ? { ...current, remaining: data.remaining } : current);
      requestAnimationFrame(() => resultHeading.current?.focus());
    } catch (error) {
      setError(error instanceof Error && error.name !== "TimeoutError" ? error.message : "El análisis ha tardado demasiado. No se ha confirmado ningún resultado.");
    } finally {
      await refreshAvailability().catch(() => {});
      setBusy(false);
    }
  }
  function download() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `region-atlas-escaner-${result.id}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="space-y-8">
    <form onSubmit={scan} className="grid items-start gap-7 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <section aria-labelledby="scanner-photos" className={`min-w-0 rounded-md outline-2 outline-offset-4 transition-colors ${dragging ? "bg-accent/5 outline-accent" : "outline-transparent"}`}
        onDragEnter={(event) => { event.preventDefault(); if (!locked && event.dataTransfer.types.includes("Files")) { dragDepth.current++; setDragging(true); } }}
        onDragLeave={(event) => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = locked || photos.length === 6 ? "none" : "copy"; }}
        onDrop={(event) => { event.preventDefault(); dragDepth.current = 0; setDragging(false); void addPhotos(event.dataTransfer.files); }}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="scanner-photos" className="text-lg font-semibold">Fotos del ejemplar</h2>
          <div className="flex items-center gap-3"><span className="text-sm tabular-nums text-muted" aria-live="polite">{photos.length} / 6</span>
            <button type="button" disabled={locked || !photos.length} onClick={emptyPhotos} aria-label="Vaciar fotos" title="Vaciar fotos" className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card hover:bg-card-hover disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => {
            const photo = photos[index];
            return <div key={photo?.id ?? `empty-${index}`} className="relative aspect-[4/3] overflow-hidden rounded-md border border-border bg-card">
              {photo ? <>
                <button type="button" className="relative block h-full w-full focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent" aria-label={`Ampliar foto ${index + 1}`} title={`Ampliar foto ${index + 1}`} onClick={() => setSelectedPhoto(photo)}>
                  <Image src={photo.url} alt={`Foto ${index + 1} del ejemplar`} fill unoptimized className="object-contain p-1" sizes="(min-width: 1024px) 200px, 45vw" />
                </button>
                <span className="absolute bottom-1 left-1 rounded bg-card/95 px-2 py-0.5 text-xs tabular-nums">{index + 1}</span>
                <button type="button" disabled={locked} onClick={() => removePhoto(photo.id)} className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card/95 hover:bg-card-hover disabled:opacity-40" aria-label={`Eliminar foto ${index + 1}`} title={`Eliminar foto ${index + 1}`}><Trash2 className="h-4 w-4" /></button>
              </> : <div className="flex h-full flex-col items-center justify-center gap-2 text-muted/60" aria-hidden><Camera className="h-6 w-6" /><span className="text-xs">{index + 1}</span></div>}
            </div>;
          })}
        </div>
        <input ref={fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Añadir fotos del juego" disabled={locked || photos.length === 6} onChange={(event) => { if (event.target.files) void addPhotos(event.target.files); }} />
        <input ref={cameraInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" aria-label="Tomar foto del juego" disabled={locked || photos.length === 6} onChange={(event) => { if (event.target.files) void addPhotos(event.target.files); }} />
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => fileInput.current?.click()} disabled={locked || photos.length === 6} className={`${command} bg-card`}>
            {preparing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}{preparing ? "Preparando fotos…" : "Elegir archivos"}
          </button>
          <button type="button" onClick={openCamera} disabled={locked || photos.length === 6} className={`${command} bg-card`}><Camera className="h-4 w-4" />Usar cámara</button>
        </div>
        <p className="mt-2 text-xs text-muted">JPG, PNG o WebP · hasta 12 MB por foto</p>
      </section>

      <div className="min-w-0 space-y-5">
        <div><label htmlFor="scanner-platform" className="mb-2 block text-sm font-medium">Plataforma</label>
          <select id="scanner-platform" required className={field} disabled={locked} value={platform} onChange={(event) => { setPlatform(event.target.value); clearAnalyses(); }}>
            <option value="">Selecciona una plataforma</option>
            {[...new Set(platforms.map((p) => p.manufacturer))].map((manufacturer) => <optgroup key={manufacturer} label={manufacturer.toUpperCase()}>
              {platforms.filter((p) => p.manufacturer === manufacturer).map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </optgroup>)}
          </select>
        </div>
        <div><label htmlFor="scanner-model" className="mb-2 block text-sm font-medium">Modelo de IA</label>
          <select id="scanner-model" className={field} disabled={locked} value={model} onChange={(event) => setModel(event.target.value as ScannerModelId)} aria-describedby="scanner-model-note">
            {SCANNER_MODELS.filter((item) => allowedModels.includes(item.id)).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.tier}</option>)}
          </select>
          <p id="scanner-model-note" className="mt-2 text-xs leading-relaxed text-muted">Capacidad general, de mayor a menor; no garantiza una lectura mejor de cada foto. {allowedModels.length === 1 && "Modelos avanzados reservados al administrador durante la evaluación."}</p>
          <details className="mt-2 text-xs text-muted"><summary className="cursor-pointer">Consumo y tarifas API</summary>
            <p className="mt-2">{modelProfile.inputRate} USD entrada / {modelProfile.outputRate} USD salida por millón de tokens, sin caché. Referencia: {SCANNER_MODEL_PRICING_DATE}. No es un precio por foto: la resolución, el modelo, el razonamiento y la caché cambian el coste.</p>
            <p className="mt-1">Cada escaneo consume API y un análisis de tu cuota, también al comparar. {modelProfile.reasoning && "Razonamiento medio."} <a href={SCANNER_MODEL_PRICING_URL} target="_blank" rel="noreferrer" className="text-accent underline">Tarifas de OpenAI</a></p>
          </details>
        </div>
        <div><label htmlFor="scanner-hint" className="mb-2 block text-sm font-medium">Información orientativa <span className="font-normal text-muted">(opcional)</span></label>
          <textarea id="scanner-hint" className={`${field} min-h-32 resize-y`} disabled={locked} value={hint} maxLength={SCANNER_MAX_HINT} onChange={(event) => { setHint(event.target.value); clearAnalyses(); }} placeholder="Título, procedencia o detalles que quieras contrastar…" aria-describedby="hint-trust" />
          <div className="mt-1 flex justify-between gap-3 text-xs text-muted"><span id="hint-trust">No se considera una prueba.</span><span className="tabular-nums">{hint.length}/{SCANNER_MAX_HINT}</span></div>
        </div>
        {availability && !availability.authenticated && <p className="text-sm"><Link href="/login?next=/escaner" className="font-semibold text-accent underline">Inicia sesión</Link> para escanear.</p>}
        {availability?.authenticated && !availability.available && <p className="text-sm text-muted">El reconocimiento está pausado o no está disponible.</p>}
        {availability?.authenticated && availability.remaining !== null && <p className="text-sm text-muted">{availability.remaining} análisis disponibles este mes · compartidos con Vitrina</p>}
        <button disabled={locked || !photos.length || !platform || !allowedModels.includes(model) || !availability?.authenticated || !availability.available || !availability.remaining} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-accent px-5 py-3 font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ScanLine className="h-5 w-5" />}{busy ? "Analizando fotos…" : "Escanear"}
        </button>
        <p className="text-xs leading-relaxed text-muted">Las fotos se envían a OpenAI para el análisis. No se conservan en Region Atlas ni se publican. El resultado es una interpretación automática, no un certificado de autenticidad.</p>
      </div>
    </form>
    {cameraOpen && <ScannerCamera onClose={() => setCameraOpen(false)} onAdd={(file) => addPhotos([file])} />}
    {error && <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">{error}</div>}
    {analyses.length > 1 && <section aria-labelledby="scanner-comparison" className="min-w-0 border-t border-border pt-6">
      <h2 id="scanner-comparison" className="text-xl font-semibold">Comparación de las mismas fotos</h2>
      <div className="mt-3 overflow-x-auto rounded-md border border-border" role="region" aria-label="Comparación de análisis" tabIndex={0}>
        <table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-card"><tr>{["Modelo", "Región sugerida", "Códigos leídos", "Tokens", "Tiempo", ""].map((label) => <th key={label} className="p-3 font-medium">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">{analyses.map((item) => <tr key={item.id} className={item.id === result?.id ? "bg-accent/5" : ""}>
            <td className="p-3">{scannerModel(item.requestedModel)?.name || item.model}</td><td className="p-3">{item.region.value || "No determinada"}</td>
            <td className="max-w-72 break-words p-3 font-mono text-xs">{item.perception.observations.flatMap((o) => o.codes.map((code) => `F${o.photo} ${SCANNER_COMPONENT_LABELS[o.component]}: ${code}`)).join(" · ") || "Sin lectura"}</td>
            <td className="p-3 tabular-nums">{item.usage.totalTokens?.toLocaleString("es-ES") ?? "No disponible"}</td><td className="p-3 tabular-nums">{(item.durationMs / 1000).toFixed(1)} s</td>
            <td className="p-3"><button type="button" disabled={busy} className={command} title={`Ver análisis de ${item.model}`} aria-label={`Ver análisis de ${item.model}`} aria-pressed={item.id === result?.id} onClick={() => setResult(item)}><Eye className="h-4 w-4" /></button></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>}
    <section aria-busy={busy} aria-labelledby="scanner-result" className="border-t border-border pt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="scanner-result" ref={resultHeading} tabIndex={-1} className="text-xl font-semibold focus:outline-none">Resultado</h2>
        {result && <button onClick={download} className={command} title="Descargar análisis" aria-label="Descargar análisis"><Download className="h-4 w-4" /></button>}
      </div>
      {!result ? <p role="status" className="py-6 text-sm text-muted">{busy ? "El engine está leyendo las fotos y contrastando las evidencias…" : "Sin análisis todavía."}</p> : <div className="mt-5 space-y-6">
        <p className="break-words text-sm text-muted">{result.model} · {result.reasoningEffort ? "Razonamiento medio · " : ""}{result.usage.totalTokens?.toLocaleString("es-ES") ?? "Consumo no disponible"}{result.usage.totalTokens !== null && " tokens"} · {(result.durationMs / 1000).toFixed(1)} s</p>
        <div className="grid gap-6 sm:grid-cols-3">
          <div><p className="text-sm text-muted">Identidad sugerida</p><p className="mt-1 break-words text-lg font-semibold">{result.perception.title || "No determinada"}</p><p className="mt-1 text-sm text-muted">{platforms.find((p) => p.slug === result.perception.platformSlug)?.name || "Plataforma no determinada"}</p></div>
          <div><p className="text-sm text-muted">Región sugerida</p><p className="mt-1 text-lg font-semibold">{result.region.value || "No determinada"}</p><p className="mt-1 text-sm text-muted">{result.region.explanation}</p><ResultEvidence result={result} evidence={result.region} /></div>
          <div><p className="text-sm text-muted">Combinación de piezas</p><p className="mt-1 text-lg font-semibold">{{ compatible: "Compatible con una referencia", possible_mismatch: "Posible mezcla de piezas", unknown: "Sin confirmar" }[result.composition.status]}</p><p className="mt-1 text-sm text-muted">{result.composition.explanation}</p><ResultEvidence result={result} evidence={result.composition} /></div>
        </div>
        {result.interpretation?.status === "skipped" ? <p role="status" className="border-l-2 border-amber-500 pl-3 text-sm">Interpretación no ejecutada: {SCANNER_SKIP_LABELS[result.interpretation.reason]}</p>
          : !result.platformMatches && <p role="status" className="border-l-2 border-amber-500 pl-3 text-sm">La plataforma observada no coincide con la seleccionada o no se distingue. No se ha asignado una región.</p>}
        <section><h3 className="mb-1 font-semibold">Observaciones por foto</h3>
          <p className="mb-3 text-xs text-muted">Lecturas automáticas pendientes de contraste; los textos pequeños pueden interpretarse incorrectamente.</p>
          <div className="divide-y divide-border border-y border-border">{result.perception.observations.map((observation) => <details key={observation.id} className="py-3" open>
            <summary className="cursor-pointer text-sm font-medium">Foto {observation.photo} · {SCANNER_COMPONENT_LABELS[observation.component]}</summary>
            <div className="mt-2 space-y-1 break-words text-sm text-muted"><p>{observation.description}</p>
              {observation.texts.length > 0 && <p>Texto leído: {observation.texts.join(" · ")}</p>}
              {observation.codes.length > 0 && <p>Códigos leídos: <span className="font-mono text-foreground">{observation.codes.join(" · ")}</span></p>}
              {observation.languages.length > 0 && <p>Idiomas impresos sugeridos: {observation.languages.join(" · ")}</p>}
              {observation.distributors.length > 0 && <p>Distribución: {observation.distributors.join(" · ")}</p>}
            </div>
          </details>)}</div>
        </section>
        {result.findings.length > 0 && <section><h3 className="mb-3 font-semibold">Interpretación del engine</h3><ul className="space-y-4">{result.findings.map((finding, index) => <li key={index}>
          <p className="text-sm font-semibold">{finding.label}</p><p className="mt-1 text-sm text-muted">{finding.detail}</p>
          <ResultEvidence result={result} evidence={finding} />
        </li>)}</ul></section>}
        {(result.perception.uncertainties.length > 0 || result.nextPhotos.length > 0) && <section><h3 className="mb-2 font-semibold">Por confirmar</h3><ul className="list-disc space-y-1 pl-5 text-sm text-muted">{[...result.perception.uncertainties, ...result.nextPhotos].map((text, index) => <li key={index}>{text}</li>)}</ul></section>}
        <details className="border-t border-border pt-4"><summary className="cursor-pointer text-sm font-medium">Fuentes y procedencia</summary>
          <p className="mt-3 text-xs text-muted">{result.model} · {result.policy} · {new Date(result.analyzedAt).toLocaleString("es-ES")}</p>
          {result.interpretation && <p className="mt-2 text-sm text-muted">{result.interpretation.status === "completed" ? "Lectura de fotos e interpretación completadas." : `Lectura de fotos completada. Interpretación omitida: ${SCANNER_SKIP_LABELS[result.interpretation.reason]}`}</p>}
          {result.perceptionMode && <p className="mt-2 text-sm text-muted">{result.perceptionMode === "joint" ? "Fotos analizadas conjuntamente." : "Fotos analizadas por separado; interpretación conjunta de las lecturas."}</p>}
          {result.perception.titleAliasId && <p className="mt-2 text-xs text-muted">Equivalencia de título revisada: {result.perception.titleAliasId}. No confirma región ni compatibilidad de piezas.</p>}
          <p className="mt-2 text-xs text-muted">Solicitudes: {result.usage.requests} · Entrada: {result.usage.inputTokens ?? "No disponible"} · Salida: {result.usage.outputTokens ?? "No disponible"} · Entrada en caché (incluida en entrada): {result.usage.cachedInputTokens ?? "No disponible"}</p>
          <p className="mt-2 text-sm text-muted">{result.knowledge.platformGuidance ? "Guía documental de plataforma consultada." : "Sin guía documental específica para esta plataforma."} {result.knowledge.exactGameMatches ? `${result.knowledge.exactGameMatches} fichas candidatas por título y plataforma; no confirman la edición.` : "Sin coincidencia exacta para consultar referencias de un juego concreto."} {!result.knowledge.learningAvailable && "El aprendizaje revisado remoto no estaba disponible."}</p>
          <ul className="mt-3 space-y-2">{result.sources.map((source) => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-start gap-1 break-all text-xs text-accent underline">{source.label}<ExternalLink className="h-3 w-3 shrink-0" /></a></li>)}</ul>
        </details>
      </div>}
    </section>
    <dialog ref={dialog} onClose={() => setSelectedPhoto(null)} className="fixed inset-0 m-auto h-[85dvh] w-[90vw] max-w-5xl rounded-lg border border-border bg-card p-3 text-foreground backdrop:bg-black/70">
      <div className="flex h-full flex-col gap-2"><button type="button" autoFocus onClick={() => dialog.current?.close()} className={`${command} self-end`} aria-label="Cerrar foto"><X className="h-5 w-5" /></button>
        {selectedPhoto && <div className="relative min-h-0 flex-1"><Image src={selectedPhoto.url} alt="Foto del ejemplar ampliada" fill unoptimized className="object-contain" sizes="90vw" /></div>}
      </div>
    </dialog>
  </div>;
}
