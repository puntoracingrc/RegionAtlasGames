import type { NewsItem } from "@/lib/types";

type Props = {
  title: string;
  eyebrow?: string;
  description?: string;
  items: NewsItem[];
};

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatNewsDate(value?: string | null): string {
  if (!value) return "Actualidad";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Actualidad";
  return dateFormatter.format(date);
}

export function NewsStrip({ title, eyebrow = "Actualidad", description, items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="mb-7 rounded-2xl border border-border bg-card/70 p-3 shadow-sm shadow-slate-950/5 md:p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.28em] text-accent">{eyebrow}</p>
          <h2 className="mt-1 text-xl font-bold text-foreground md:text-2xl">{title}</h2>
          {description && <p className="mt-1 max-w-2xl text-xs text-muted md:text-sm">{description}</p>}
        </div>
      </div>
      <div className="-mx-3 overflow-x-auto px-3 pb-1 [scrollbar-width:thin] md:-mx-4 md:px-4">
        <div className="flex gap-3">
        {items.map((item) => (
          <article
            key={item.id}
            className="w-[260px] shrink-0 overflow-hidden rounded-2xl border border-border bg-background/60 transition hover:-translate-y-0.5 hover:border-accent/30 hover:bg-card-hover sm:w-[300px] lg:w-[330px]"
          >
            {item.imageUrl && (
              <div className="aspect-[16/8] overflow-hidden bg-muted/10">
                <img
                  src={item.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </div>
            )}
            <div className="space-y-2.5 p-3">
              <div className="flex items-center gap-2 text-[11px] text-muted">
                {item.sourceIconUrl && (
                  <img
                    src={item.sourceIconUrl}
                    alt=""
                    className="h-4 w-4 rounded-sm"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                )}
                <span className="font-semibold text-foreground/80">{item.sourceName}</span>
                <span>·</span>
                <time dateTime={item.publishedAt ?? undefined}>{formatNewsDate(item.publishedAt)}</time>
              </div>
              <h3 className="line-clamp-2 text-sm font-bold leading-snug text-foreground md:text-[15px]">
                {item.title}
              </h3>
              {item.snippet && <p className="line-clamp-2 text-sm leading-relaxed text-muted">{item.snippet}</p>}
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex rounded-xl border border-accent/30 px-2.5 py-1 text-[11px] font-semibold text-accent transition hover:bg-accent/10"
              >
                Leer en la fuente
              </a>
            </div>
          </article>
        ))}
        </div>
      </div>
    </section>
  );
}
