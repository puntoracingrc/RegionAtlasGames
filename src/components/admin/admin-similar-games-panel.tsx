"use client";

import Link from "next/link";
import { CoverArt } from "@/components/cover-art";
import { getCoverSrc } from "@/lib/cover-url";

export type SimilarCatalogMatchView = {
  catalogId: string;
  title: string;
  titlePc: string | null;
  region: string;
  slug: string;
  similarity: number;
  catalogUrl: string;
  coverUrl: string | null;
  year: number | null;
  series: string | null;
  matchReason: string;
};

type Props = {
  pendingTitle: string;
  pendingRegion: string;
  pendingPlatformLabel: string;
  matches: SimilarCatalogMatchView[];
  mode: "preview" | "confirm";
  loading?: boolean;
  onConfirmDistinct?: () => void;
  onCancel?: () => void;
  confirmLoading?: boolean;
};

export function AdminSimilarGamesPanel({
  pendingTitle,
  pendingRegion,
  pendingPlatformLabel,
  matches,
  mode,
  loading = false,
  onConfirmDistinct,
  onCancel,
  confirmLoading = false,
}: Props) {
  if (!loading && matches.length === 0) return null;

  const isConfirm = mode === "confirm";

  return (
    <div
      className={
        isConfirm
          ? "rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 sm:p-5"
          : "rounded-lg border border-border/70 bg-muted/10 p-4"
      }
      role={isConfirm ? "alertdialog" : "status"}
      aria-labelledby="similar-games-title"
    >
      <h3
        id="similar-games-title"
        className={
          isConfirm
            ? "text-base font-semibold text-amber-950 dark:text-amber-100"
            : "text-sm font-medium text-foreground"
        }
      >
        {loading
          ? "Buscando títulos parecidos…"
          : isConfirm
            ? "¿Es alguno de estos juegos?"
            : "Posibles coincidencias en el catálogo"}
      </h3>

      {!loading && (
        <>
          <p
            className={
              isConfirm
                ? "mt-2 text-sm text-amber-950/85 dark:text-amber-100/85"
                : "mt-1 text-xs text-muted"
            }
          >
            {isConfirm ? (
              <>
                Vas a crear <strong>{pendingTitle}</strong> ({pendingPlatformLabel},{" "}
                {pendingRegion}). Revisa la lista: a veces coinciden por la misma saga, pero otras
                veces ya lo tenías y sería un duplicado.
              </>
            ) : (
              <>
                Para «{pendingTitle}» ({pendingPlatformLabel}, {pendingRegion}). Si alguno es el
                mismo juego, no lo añadas otra vez.
              </>
            )}
          </p>

          <ul className="mt-4 space-y-3">
            {matches.map((match) => (
                <li
                  key={match.catalogId}
                  className="flex gap-3 rounded-lg border border-border/70 bg-background/90 p-3"
                >
                  <div className="h-20 w-14 shrink-0">
                    <CoverArt
                      src={getCoverSrc(match.coverUrl, match.catalogId)}
                      alt={match.title}
                      className="h-20 w-14"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium leading-snug">{match.title}</div>
                    <div className="mt-0.5 text-xs text-muted">
                      {match.region}
                      {match.year ? ` · ${match.year}` : ""}
                      {match.series ? ` · ${match.series}` : ""}
                    </div>
                    <div className="mt-1 text-xs text-muted">{match.matchReason}</div>
                    <div className="mt-1 text-[11px] font-mono text-muted/80">
                      {match.catalogId} · {Math.round(match.similarity * 100)}% parecido
                    </div>
                    <Link
                      href={match.catalogUrl}
                      className="mt-2 inline-block text-xs font-medium text-accent hover:underline"
                      target="_blank"
                    >
                      Abrir ficha existente →
                    </Link>
                  </div>
                </li>
              ))}
          </ul>

          {isConfirm && onCancel && onConfirmDistinct && (
            <div className="mt-5 space-y-2 border-t border-amber-500/30 pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                ¿Qué quieres hacer?
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted/20"
                  onClick={onCancel}
                >
                  Ya lo tengo — no añadir
                </button>
                <button
                  type="button"
                  className="btn-primary px-4 py-2.5 text-sm"
                  disabled={confirmLoading}
                  onClick={onConfirmDistinct}
                >
                  {confirmLoading
                    ? "Creando…"
                    : "Es otro juego distinto — crear ficha nueva"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
