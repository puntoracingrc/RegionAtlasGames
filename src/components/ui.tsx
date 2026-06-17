import { cn } from "@/lib/cn";

export function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border/80 bg-card/90 p-4 shadow-sm shadow-black/5 backdrop-blur sm:p-5 dark:shadow-black/20",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelTitle({
  children,
  eyebrow,
}: {
  children: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      {eyebrow ? (
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{children}</h2>
    </div>
  );
}

export function PriceBox({
  label,
  value,
  main = false,
}: {
  label: string;
  value: string;
  main?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5 sm:p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p
        className={cn(
          "mt-1.5 font-bold",
          main ? "text-xl text-accent sm:text-2xl" : "text-base text-foreground sm:text-lg",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "green" | "amber" | "rose" | "violet";
}) {
  const tones = {
    neutral: "bg-card-hover text-foreground border border-border",
    green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    amber: "bg-amber-500/15 text-amber-800 dark:text-accent",
    rose: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    violet: "bg-violet-500/15 text-violet-800 dark:text-violet-300",
  };
  return (
    <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}
