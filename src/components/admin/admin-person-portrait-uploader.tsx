"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { CheckCircle2, ImagePlus, LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";

const MAX_BYTES = 12 * 1024 * 1024;

type UploadResponse = {
  portrait?: {
    path: string;
    width: number;
    height: number;
    bytes: number;
    uploadedAt: string;
  };
  error?: string;
};

export function AdminPersonPortraitUploader({
  slug,
  name,
  initialPortraitPath,
}: {
  slug: string;
  name: string;
  initialPortraitPath: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [portraitPath, setPortraitPath] = useState(initialPortraitPath);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setMessage(null);
    if (file.type && !file.type.startsWith("image/")) {
      setError("Selecciona un archivo de imagen.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("La imagen supera el límite de 12 MB.");
      return;
    }

    setUploading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("rightsConfirmed", "1");
      const response = await fetch(`/api/admin/entities/personas/${encodeURIComponent(slug)}/portrait`, {
        method: "POST",
        body,
      });
      const payload = await response.json() as UploadResponse;
      if (!response.ok || !payload.portrait) {
        throw new Error(payload.error || "No se pudo subir el retrato.");
      }
      setPortraitPath(payload.portrait.path);
      setMessage("Retrato publicado.");
      router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "No se pudo subir el retrato.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!uploading) setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!uploading) setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file && !uploading) void upload(file);
        }}
        className={`group grid w-full grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2 rounded-lg border p-2 text-left transition disabled:cursor-wait disabled:opacity-70 ${
          dragging
            ? "border-accent bg-accent/10"
            : "border-dashed border-border bg-background/45 hover:border-accent/50 hover:bg-card-hover"
        }`}
        aria-label={`Subir retrato de ${name}`}
      >
        <span className="relative flex aspect-square w-14 items-center justify-center overflow-hidden rounded-md bg-card-hover text-muted">
          {portraitPath ? (
            <Image src={portraitPath} alt="" fill sizes="56px" className="object-contain" />
          ) : (
            <ImagePlus className="h-6 w-6" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            {uploading && <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            {uploading ? "Procesando…" : portraitPath ? "Cambiar retrato" : "Añadir retrato"}
          </span>
          <span className="mt-0.5 block text-[10px] leading-4 text-muted">
            Arrastra aquí o pulsa · JPG, PNG, WebP, AVIF · máx. 12 MB
          </span>
        </span>
      </button>
      <p className="text-[10px] leading-4 text-muted">
        Al subir confirmas que tienes autorización o base legal para publicarla.
      </p>
      <div className="min-h-4 text-[10px]" aria-live="polite">
        {error ? <p className="text-rose-600 dark:text-rose-300">{error}</p> : null}
        {message ? (
          <p className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
