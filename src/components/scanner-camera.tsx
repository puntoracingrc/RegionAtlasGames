"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, LoaderCircle, RotateCcw, X } from "lucide-react";
import { cameraErrorMessage, captureCameraPhoto, stopCamera } from "@/lib/scanner-camera-client";

const command = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-card-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50";

export function ScannerCamera({ onClose, onAdd }: { onClose: () => void; onAdd: (file: File) => Promise<boolean> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const active = useRef(false);
  const request = useRef(0);
  const captureUrl = useRef("");
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [opening, setOpening] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const stop = useCallback(() => {
    request.current++;
    stopCamera(stream.current);
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  const start = useCallback(async () => {
    stop();
    const id = request.current;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("Cámara no disponible");
      const next = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 1920 }, height: { ideal: 1080 } } });
      // A permission prompt can finish after closing the dialog or changing tabs.
      if (!active.current || id !== request.current || document.hidden) { stopCamera(next); return; }
      stream.current = next;
      if (video.current) { video.current.srcObject = next; await video.current.play(); }
    } catch (error) {
      if (active.current && id === request.current) { stop(); setOpening(false); setError(cameraErrorMessage(error)); }
    } finally { if (active.current && id === request.current) setOpening(false); }
  }, [stop]);

  useEffect(() => {
    active.current = true;
    dialog.current?.showModal();
    void start();
    const hide = () => {
      if (!document.hidden) return;
      stop(); setReady(false); setOpening(false);
      if (!captureUrl.current) setError("La cámara se ha detenido al cambiar de pestaña. Pulsa Reintentar para abrirla.");
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      active.current = false; stop();
      URL.revokeObjectURL(captureUrl.current);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [start, stop]);

  function close() { if (!working) { stop(); onClose(); } }
  function retry() { setReady(false); setOpening(true); setError(""); void start(); }
  async function capture() {
    if (!video.current || working) return;
    setWorking(true); setError("");
    try {
      const file = await captureCameraPhoto(video.current);
      if (!active.current) return;
      const url = URL.createObjectURL(file);
      captureUrl.current = url;
      setPhoto({ file, url }); stop(); setReady(false);
    } catch (error) { if (active.current) setError(error instanceof Error ? error.message : "No se pudo capturar la foto."); }
    finally { if (active.current) setWorking(false); }
  }
  function retake() {
    URL.revokeObjectURL(captureUrl.current); captureUrl.current = "";
    setPhoto(null); retry();
  }
  async function accept() {
    if (!photo || working) return;
    setWorking(true); setError("");
    try {
      if (await onAdd(photo.file)) onClose();
      else if (active.current) setError("No se pudo añadir esta foto. Prueba a repetirla.");
    } finally { if (active.current) setWorking(false); }
  }

  return <dialog ref={dialog} aria-labelledby="scanner-camera-title" onCancel={(event) => { event.preventDefault(); close(); }} onClose={onClose} className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-lg border border-border bg-background p-4 text-foreground backdrop:bg-black/70">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 id="scanner-camera-title" className="text-lg font-semibold">{photo ? "Revisar captura" : "Cámara"}</h2>
      <button type="button" autoFocus disabled={working} onClick={close} aria-label="Cerrar cámara" title="Cerrar cámara" className={`${command} px-3`}><X className="h-5 w-5" /></button>
    </div>
    <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-black">
      <video ref={video} autoPlay muted playsInline onLoadedData={() => setReady(Boolean(stream.current))} className={`h-full w-full object-contain ${photo ? "hidden" : ""}`} aria-label="Vista de la cámara" />
      {photo && <Image src={photo.url} alt="Foto capturada pendiente de añadir" fill unoptimized className="object-contain" sizes="(min-width: 700px) 640px, 90vw" />}
      {opening && <div role="status" className="absolute inset-0 flex items-center justify-center gap-2 text-white"><LoaderCircle className="h-5 w-5 animate-spin" />Abriendo cámara…</div>}
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
    <div className="mt-4 flex flex-wrap justify-end gap-2">
      {photo ? <>
        <button type="button" disabled={working} onClick={retake} className={command}><RotateCcw className="h-4 w-4" />Repetir</button>
        <button type="button" disabled={working} onClick={() => void accept()} className={`${command} bg-accent text-white hover:brightness-110 hover:bg-accent`}>{working ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Usar foto</button>
      </> : <>
        {!opening && !ready && <button type="button" onClick={retry} className={command}><RotateCcw className="h-4 w-4" />Reintentar</button>}
        <button type="button" disabled={!ready || working} onClick={() => void capture()} className={`${command} bg-accent text-white hover:brightness-110 hover:bg-accent`}><Camera className="h-4 w-4" />Capturar foto</button>
      </>}
    </div>
  </dialog>;
}
