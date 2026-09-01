"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Images,
  LoaderCircle,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  COLLECTION_PHOTO_LABELS,
  COLLECTION_PHOTO_SLOTS,
  orderedCollectionPhotos,
} from "@/lib/collection-photos";
import {
  LISTING_PHOTO_UPLOAD_TIMEOUT_MS,
  listingPhotoUploadError,
  prepareListingPhoto,
} from "@/lib/listing-photo-client";
import type {
  CollectionPhoto,
  CollectionPhotoSlot,
  CollectionView,
} from "@/lib/types";

type Props = {
  item: CollectionView;
  disabled: boolean;
  onSaved: (item: CollectionView) => void;
};

function CollectionPhotoGallery({
  photos,
  initialSlot,
  title,
  onDelete,
  onClose,
}: {
  photos: CollectionPhoto[];
  initialSlot: CollectionPhotoSlot;
  title: string;
  onDelete: (slot: CollectionPhotoSlot) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const initialIndex = Math.max(0, photos.findIndex((photo) => photo.slot === initialSlot));
  const [index, setIndex] = useState(initialIndex);
  const current = photos[index] ?? photos[0];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") {
        setIndex((currentIndex) => (currentIndex - 1 + photos.length) % photos.length);
      }
      if (event.key === "ArrowRight") {
        setIndex((currentIndex) => (currentIndex + 1) % photos.length);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, photos.length]);

  if (!current) return null;
  const label = COLLECTION_PHOTO_LABELS[current.slot];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-white/15 bg-[#090b10] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-sm font-semibold text-white sm:text-base">
              {title}
            </h2>
            <p className="text-xs text-white/60">
              {label} · {index + 1} de {photos.length}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/15 text-white/70 transition hover:border-rose-300/40 hover:text-rose-300"
              aria-label={`Eliminar ${label}`}
              title={`Eliminar ${label}`}
              onClick={() => onDelete(current.slot)}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
            <button
              ref={closeButton}
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/15 text-white/80 transition hover:bg-white/10 hover:text-white"
              aria-label="Cerrar galería"
              title="Cerrar galería"
              onClick={onClose}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black p-2 sm:p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.url}
            alt={`${label} de ${title}`}
            className="max-h-[68vh] max-w-full object-contain"
          />
          {photos.length > 1 ? (
            <>
              <button
                type="button"
                className="absolute left-2 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/65 text-white transition hover:bg-black/85 sm:left-4"
                aria-label="Foto anterior"
                title="Foto anterior"
                onClick={() => setIndex((currentIndex) => (currentIndex - 1 + photos.length) % photos.length)}
              >
                <ChevronLeft className="h-6 w-6" aria-hidden />
              </button>
              <button
                type="button"
                className="absolute right-2 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/65 text-white transition hover:bg-black/85 sm:right-4"
                aria-label="Foto siguiente"
                title="Foto siguiente"
                onClick={() => setIndex((currentIndex) => (currentIndex + 1) % photos.length)}
              >
                <ChevronRight className="h-6 w-6" aria-hidden />
              </button>
            </>
          ) : null}
        </div>

        {photos.length > 1 ? (
          <div className="grid grid-cols-6 gap-1.5 border-t border-white/10 p-2 sm:gap-2 sm:p-3">
            {photos.map((photo, photoIndex) => (
              <button
                key={photo.slot}
                type="button"
                className={cn(
                  "aspect-[4/3] min-w-0 overflow-hidden rounded-md border bg-black",
                  photoIndex === index ? "border-accent ring-1 ring-accent" : "border-white/15",
                )}
                aria-label={`Ver ${COLLECTION_PHOTO_LABELS[photo.slot]}`}
                onClick={() => setIndex(photoIndex)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function CollectionCopyPhotos({ item, disabled, onSaved }: Props) {
  const fileInputs = useRef<Partial<Record<CollectionPhotoSlot, HTMLInputElement | null>>>({});
  const cameraInputs = useRef<Partial<Record<CollectionPhotoSlot, HTMLInputElement | null>>>({});
  const [photoUpload, setPhotoUpload] = useState<{
    slot: CollectionPhotoSlot;
    phase: "preparing" | "uploading" | "deleting";
  } | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [gallerySlot, setGallerySlot] = useState<CollectionPhotoSlot | null>(null);
  const closeGallery = useCallback(() => setGallerySlot(null), []);
  const photos = orderedCollectionPhotos(item.photos);
  const visibleSlots = COLLECTION_PHOTO_SLOTS.slice(0, 2);
  const detailSlots = COLLECTION_PHOTO_SLOTS.slice(2);
  const detailPhotos = photos.filter((photo) => detailSlots.includes(photo.slot));
  const nextDetailSlot = detailSlots.find(
    (slot) => !photos.some((photo) => photo.slot === slot),
  );
  const busy = disabled || photoUpload !== null;

  async function upload(slot: CollectionPhotoSlot, file: File) {
    setFeedback(null);
    setPhotoUpload({ slot, phase: "preparing" });
    let timeoutId: number | undefined;
    try {
      const prepared = await prepareListingPhoto(file);
      setPhotoUpload({ slot, phase: "uploading" });
      const controller = new AbortController();
      timeoutId = window.setTimeout(() => controller.abort(), LISTING_PHOTO_UPLOAD_TIMEOUT_MS);
      const form = new FormData();
      form.append("slot", slot);
      form.append("file", prepared.file);
      const response = await fetch(
        `/api/user/collection/copies/${encodeURIComponent(item.id)}/photos`,
        { method: "POST", body: form, signal: controller.signal },
      );
      const data = await response.json().catch(() => null) as {
        item?: CollectionView;
        error?: string;
      } | null;
      if (!response.ok || !data?.item) {
        throw new Error(listingPhotoUploadError(response.status, data?.error));
      }
      onSaved(data.item);
      setFeedback({
        tone: "success",
        text: prepared.resized ? "Foto reducida y guardada." : "Foto guardada.",
      });
    } catch (error) {
      const text = error instanceof DOMException && error.name === "AbortError"
        ? "La subida ha tardado demasiado. Comprueba la conexión y vuelve a intentarlo."
        : error instanceof Error
          ? error.message
          : "No se pudo subir la foto.";
      setFeedback({ tone: "error", text });
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      setPhotoUpload(null);
    }
  }

  async function remove(slot: CollectionPhotoSlot) {
    if (!confirm(`¿Eliminar ${COLLECTION_PHOTO_LABELS[slot].toLowerCase()}?`)) return;
    setFeedback(null);
    setPhotoUpload({ slot, phase: "deleting" });
    setGallerySlot(null);
    try {
      const response = await fetch(
        `/api/user/collection/copies/${encodeURIComponent(item.id)}/photos/${slot}`,
        { method: "DELETE" },
      );
      const data = await response.json().catch(() => null) as {
        item?: CollectionView;
        error?: string;
      } | null;
      if (!response.ok || !data?.item) {
        throw new Error(data?.error ?? "No se pudo eliminar la foto.");
      }
      onSaved(data.item);
      setFeedback({ tone: "success", text: "Foto eliminada." });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "No se pudo eliminar la foto.",
      });
    } finally {
      setPhotoUpload(null);
    }
  }

  return (
    <div className="mt-3 border-t border-border/70 pt-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase text-muted">Tus fotos</span>
        <span className="text-[11px] tabular-nums text-muted">{photos.length}/6</span>
      </div>
      <div className="grid max-w-[290px] grid-cols-2 gap-2">
        {visibleSlots.map((slot) => {
          const label = COLLECTION_PHOTO_LABELS[slot];
          const photo = photos.find((stored) => stored.slot === slot);
          const phase = photoUpload?.slot === slot ? photoUpload.phase : null;
          return (
            <div key={slot} className="min-w-0 overflow-hidden rounded-md border border-border bg-card/60">
              {photo ? (
                <button
                  type="button"
                  className="block aspect-[4/3] w-full overflow-hidden bg-black/80"
                  aria-label={`Abrir ${label} en la galería`}
                  aria-haspopup="dialog"
                  onClick={() => setGallerySlot(slot)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={label} className="h-full w-full object-contain" />
                </button>
              ) : (
                <button
                  type="button"
                  className="flex aspect-[4/3] w-full items-center justify-center bg-background/50 text-muted transition hover:text-accent disabled:opacity-50"
                  disabled={busy}
                  aria-label={`Añadir ${label}`}
                  title={`Añadir ${label}`}
                  onClick={() => fileInputs.current[slot]?.click()}
                >
                  {phase ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden /> : <ImagePlus className="h-5 w-5" aria-hidden />}
                </button>
              )}
              <div className="flex min-h-9 items-center justify-between gap-1 border-t border-border/70 px-1.5">
                <span className="min-w-0 truncate text-[9px] font-medium text-muted">{label}</span>
                <div className="flex shrink-0 items-center">
                  {phase ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin text-accent" aria-hidden />
                  ) : (
                    <>
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 items-center justify-center text-muted transition hover:text-accent disabled:opacity-40"
                        disabled={busy}
                        aria-label={`${photo ? "Cambiar" : "Añadir"} ${label}`}
                        title={`${photo ? "Cambiar" : "Añadir"} ${label}`}
                        onClick={() => fileInputs.current[slot]?.click()}
                      >
                        <ImagePlus className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 items-center justify-center text-muted transition hover:text-accent disabled:opacity-40 md:hidden"
                        disabled={busy}
                        aria-label={`Hacer foto para ${label}`}
                        title={`Hacer foto para ${label}`}
                        onClick={() => cameraInputs.current[slot]?.click()}
                      >
                        <Camera className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      {photo ? (
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center text-muted transition hover:text-rose-600 disabled:opacity-40"
                          disabled={busy}
                          aria-label={`Eliminar ${label}`}
                          title={`Eliminar ${label}`}
                          onClick={() => void remove(slot)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
              <input
                ref={(node) => {
                  fileInputs.current[slot] = node;
                }}
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={busy}
                data-testid={`collection-photo-file-${slot}`}
                onChange={(event) => {
                  const input = event.currentTarget;
                  const file = input.files?.[0];
                  input.value = "";
                  if (file) void upload(slot, file);
                }}
              />
              <input
                ref={(node) => {
                  cameraInputs.current[slot] = node;
                }}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                disabled={busy}
                onChange={(event) => {
                  const input = event.currentTarget;
                  const file = input.files?.[0];
                  input.value = "";
                  if (file) void upload(slot, file);
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {nextDetailSlot ? (
          <>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition hover:border-accent/50 hover:text-accent disabled:opacity-50"
              disabled={busy}
              onClick={() => fileInputs.current[nextDetailSlot]?.click()}
            >
              <ImagePlus className="h-3.5 w-3.5" aria-hidden />
              Añadir otra foto
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted transition hover:border-accent/50 hover:text-accent disabled:opacity-50 md:hidden"
              disabled={busy}
              aria-label="Hacer otra foto"
              title="Hacer otra foto"
              onClick={() => cameraInputs.current[nextDetailSlot]?.click()}
            >
              <Camera className="h-3.5 w-3.5" aria-hidden />
            </button>
          </>
        ) : null}
        {detailPhotos.length > 0 ? (
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted transition hover:border-accent/50 hover:text-accent"
            aria-haspopup="dialog"
            onClick={() => setGallerySlot(detailPhotos[0].slot)}
          >
            <Images className="h-3.5 w-3.5" aria-hidden />
            +{detailPhotos.length} {detailPhotos.length === 1 ? "foto" : "fotos"}
          </button>
        ) : null}
      </div>

      {detailSlots.map((slot) => (
        <span key={slot} className="hidden">
          <input
            ref={(node) => {
              fileInputs.current[slot] = node;
            }}
            type="file"
            accept="image/*"
            disabled={busy}
            data-testid={`collection-photo-file-${slot}`}
            onChange={(event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              input.value = "";
              if (file) void upload(slot, file);
            }}
          />
          <input
            ref={(node) => {
              cameraInputs.current[slot] = node;
            }}
            type="file"
            accept="image/*"
            capture="environment"
            disabled={busy}
            onChange={(event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              input.value = "";
              if (file) void upload(slot, file);
            }}
          />
        </span>
      ))}

      {feedback ? (
        <p
          role={feedback.tone === "error" ? "alert" : "status"}
          className={cn(
            "mt-2 text-xs",
            feedback.tone === "error"
              ? "text-rose-700 dark:text-rose-300"
              : "text-emerald-700 dark:text-emerald-300",
          )}
        >
          {feedback.text}
        </p>
      ) : null}

      {gallerySlot && photos.length > 0 ? (
        <CollectionPhotoGallery
          key={gallerySlot}
          photos={photos}
          initialSlot={gallerySlot}
          title={item.title}
          onDelete={(slot) => void remove(slot)}
          onClose={closeGallery}
        />
      ) : null}
    </div>
  );
}
