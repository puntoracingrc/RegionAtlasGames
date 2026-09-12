"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/cn";

export type PhysicalEditionGalleryImage = {
  id: string;
  src: string;
  thumbnailSrc: string;
  width: number;
  height: number;
  label: string;
};

const ZOOM_LEVELS = [1, 1.5, 2, 3] as const;

export function PhysicalEditionImageGallery({
  images,
  title,
}: {
  images: PhysicalEditionGalleryImage[];
  title: string;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement | null>(null);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState<number>(1);
  const current = images[index] ?? images[0];

  const showImage = useCallback(
    (nextIndex: number) => {
      setIndex((nextIndex + images.length) % images.length);
      setZoom(1);
    },
    [images.length],
  );

  const previous = useCallback(() => {
    setIndex(
      (currentIndex) => (currentIndex - 1 + images.length) % images.length,
    );
    setZoom(1);
  }, [images.length]);

  const next = useCallback(() => {
    setIndex((currentIndex) => (currentIndex + 1) % images.length);
    setZoom(1);
  }, [images.length]);

  const zoomOut = useCallback(() => {
    setZoom((currentZoom) => {
      const currentIndex = ZOOM_LEVELS.indexOf(
        currentZoom as (typeof ZOOM_LEVELS)[number],
      );
      return ZOOM_LEVELS[Math.max(0, currentIndex - 1)] ?? 1;
    });
  }, []);

  const zoomIn = useCallback(() => {
    setZoom((currentZoom) => {
      const currentIndex = ZOOM_LEVELS.indexOf(
        currentZoom as (typeof ZOOM_LEVELS)[number],
      );
      return (
        ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, currentIndex + 1)] ?? 1
      );
    });
  }, []);

  const closeGallery = useCallback(() => {
    dialog.current?.close();
  }, []);

  useEffect(() => {
    if (!open || images.length < 2) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        previous();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        next();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [images.length, next, open, previous]);

  if (!current) {
    return (
      <div className="flex aspect-[3/4] w-full max-w-[132px] items-center justify-center border border-border bg-background px-3 text-center text-[10px] font-semibold uppercase leading-4 text-muted">
        Portada pendiente de evidencia
      </div>
    );
  }

  const openGallery = () => {
    setZoom(1);
    setOpen(true);
    dialog.current?.showModal();
  };

  return (
    <div className="w-full max-w-[132px]">
      <div className="relative aspect-[3/4] overflow-hidden border border-border bg-background">
        <button
          type="button"
          className="group absolute inset-0 flex items-center justify-center"
          aria-label={`Ampliar ${current.label.toLowerCase()}`}
          aria-haspopup="dialog"
          onClick={openGallery}
        >
          <Image
            unoptimized
            fill
            src={current.thumbnailSrc}
            alt={current.label}
            sizes="132px"
            className="object-contain"
          />
          <span className="absolute bottom-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-md bg-black/70 text-white opacity-80 transition group-hover:opacity-100">
            <Maximize2 className="h-4 w-4" aria-hidden />
          </span>
        </button>

        {images.length > 1 ? (
          <>
            <button
              type="button"
              className="absolute left-1 top-1/2 z-10 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/70 text-white transition hover:bg-black/90"
              aria-label="Imagen anterior"
              title="Imagen anterior"
              onClick={previous}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              className="absolute right-1 top-1/2 z-10 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/70 text-white transition hover:bg-black/90"
              aria-label="Imagen siguiente"
              title="Imagen siguiente"
              onClick={next}
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
            <span className="pointer-events-none absolute bottom-2 left-2 z-10 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {index + 1}/{images.length}
            </span>
          </>
        ) : null}
        <span className="sr-only" aria-live="polite">{current.label}</span>
      </div>

      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="fixed inset-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-2 text-white backdrop:bg-black/90 sm:p-5"
        onCancel={() => setOpen(false)}
        onClose={() => {
          setOpen(false);
          setZoom(1);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeGallery();
        }}
      >
        <div
          className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-white/15 bg-[#090b10] shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2 sm:px-4 sm:py-3">
            <div className="min-w-0">
              <h2
                id={titleId}
                className="truncate text-sm font-semibold text-white sm:text-base"
              >
                {title}
              </h2>
              <p className="truncate text-xs text-white/60">
                {current.label} · {index + 1} de {images.length}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/15 text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="Reducir imagen"
                title="Reducir imagen"
                disabled={zoom === ZOOM_LEVELS[0]}
                onClick={zoomOut}
              >
                <ZoomOut className="h-5 w-5" aria-hidden />
              </button>
              <span className="w-12 text-center text-xs tabular-nums text-white/65">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/15 text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="Ampliar imagen"
                title="Ampliar imagen"
                disabled={zoom === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
                onClick={zoomIn}
              >
                <ZoomIn className="h-5 w-5" aria-hidden />
              </button>
              <button
                type="button"
                autoFocus
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/15 text-white/80 transition hover:bg-white/10"
                aria-label="Cerrar galería"
                title="Cerrar galería"
                onClick={closeGallery}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </header>

          <div className="relative min-h-0 flex-1 bg-black">
            <div className="h-full overflow-auto">
              <div className={cn(
                "flex min-h-full min-w-full p-3 sm:p-5",
                zoom === 1 ? "items-center justify-center" : "items-start justify-start",
              )}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={current.src}
                  alt={current.label}
                  width={current.width}
                  height={current.height}
                  className={
                    zoom === 1
                      ? "max-h-[calc(100dvh-11rem)] max-w-full object-contain"
                      : "h-auto max-w-none"
                  }
                  style={zoom === 1 ? undefined : { width: `${zoom * 100}%` }}
                />
              </div>
            </div>

            {images.length > 1 ? (
              <>
                <button
                  type="button"
                  className="absolute left-2 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white transition hover:bg-black/90 sm:left-4"
                  aria-label="Imagen anterior"
                  title="Imagen anterior"
                  onClick={previous}
                >
                  <ChevronLeft className="h-7 w-7" aria-hidden />
                </button>
                <button
                  type="button"
                  className="absolute right-2 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white transition hover:bg-black/90 sm:right-4"
                  aria-label="Imagen siguiente"
                  title="Imagen siguiente"
                  onClick={next}
                >
                  <ChevronRight className="h-7 w-7" aria-hidden />
                </button>
              </>
            ) : null}
          </div>

          {images.length > 1 ? (
            <div className="flex shrink-0 gap-2 overflow-x-auto border-t border-white/10 p-2 sm:p-3">
              {images.map((image, imageIndex) => (
                <button
                  key={image.id}
                  type="button"
                  className={cn(
                    "relative h-14 w-14 shrink-0 overflow-hidden rounded-md border bg-black sm:h-16 sm:w-16",
                    imageIndex === index ? "border-accent ring-1 ring-accent" : "border-white/15",
                  )}
                  aria-label={`Ver ${image.label.toLowerCase()}`}
                  aria-current={imageIndex === index ? "true" : undefined}
                  title={image.label}
                  onClick={() => showImage(imageIndex)}
                >
                  <Image
                    unoptimized
                    fill
                    src={image.thumbnailSrc}
                    alt=""
                    sizes="64px"
                    className="object-contain"
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </dialog>
    </div>
  );
}
