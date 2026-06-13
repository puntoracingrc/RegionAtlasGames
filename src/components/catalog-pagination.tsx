"use client";

import { cn } from "@/lib/cn";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
};

function pageRange(page: number, totalPages: number): number[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  return [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
}

export function CatalogPagination({ page, pageSize, total, onPageChange, className }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const pages = pageRange(page, totalPages);

  return (
    <nav
      className={cn("flex flex-col items-center gap-3", className)}
      aria-label="Paginación del catálogo"
    >
      <p className="text-sm text-muted">
        {start.toLocaleString("es-ES")}–{end.toLocaleString("es-ES")} de {total.toLocaleString("es-ES")}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <PaginationButton
          label="Anterior"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        />

        {pages.map((p, index) => {
          const prev = pages[index - 1];
          const showEllipsis = prev != null && p - prev > 1;
          return (
            <span key={p} className="flex items-center gap-1.5">
              {showEllipsis && <span className="px-1 text-sm text-muted">…</span>}
              <button
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={p === page ? "page" : undefined}
                className={cn(
                  "min-w-9 cursor-pointer rounded-lg border px-2.5 py-1.5 text-sm transition",
                  p === page
                    ? "cursor-default border-accent/40 bg-accent/15 font-semibold text-accent"
                    : "border-border bg-card text-foreground hover:border-accent/30 hover:bg-card-hover",
                )}
              >
                {p}
              </button>
            </span>
          );
        })}

        <PaginationButton
          label="Siguiente"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        />
      </div>
    </nav>
  );
}

function PaginationButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="cursor-pointer rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground transition hover:border-accent/30 hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}
