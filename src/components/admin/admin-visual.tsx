import { cn } from "@/lib/cn";

export type AdminVisualTone =
  | "neutral"
  | "search"
  | "edit"
  | "media"
  | "ai"
  | "bulk"
  | "status"
  | "danger";

const toneStyles: Record<AdminVisualTone, string> = {
  neutral: "border-border bg-background/45",
  search: "border-sky-300/60 bg-sky-100/45 dark:border-sky-400/30 dark:bg-sky-950/20",
  edit: "border-amber-300/70 bg-amber-100/45 dark:border-amber-400/30 dark:bg-amber-950/20",
  media: "border-cyan-300/60 bg-cyan-100/45 dark:border-cyan-400/30 dark:bg-cyan-950/20",
  ai: "border-violet-300/60 bg-violet-100/45 dark:border-violet-400/30 dark:bg-violet-950/20",
  bulk: "border-indigo-300/60 bg-indigo-100/45 dark:border-indigo-400/30 dark:bg-indigo-950/20",
  status: "border-emerald-300/70 bg-emerald-100/55 dark:border-emerald-400/30 dark:bg-emerald-950/30",
  danger: "border-rose-300/70 bg-rose-100/55 dark:border-rose-400/30 dark:bg-rose-950/35",
};

const labelStyles: Record<AdminVisualTone, string> = {
  neutral: "text-muted",
  search: "text-sky-800 dark:text-sky-200",
  edit: "text-amber-800 dark:text-amber-200",
  media: "text-cyan-800 dark:text-cyan-200",
  ai: "text-violet-800 dark:text-violet-200",
  bulk: "text-indigo-800 dark:text-indigo-200",
  status: "text-emerald-800 dark:text-emerald-200",
  danger: "text-rose-800 dark:text-rose-200",
};

export function adminToneClass(tone: AdminVisualTone): string {
  return toneStyles[tone];
}

export function adminToneLabelClass(tone: AdminVisualTone): string {
  return labelStyles[tone];
}

export function AdminFunctionCard({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: AdminVisualTone;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border p-4", toneStyles[tone], className)}>
      {children}
    </section>
  );
}

export function AdminStatTile({
  label,
  value,
  helper,
  tone = "neutral",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  helper?: React.ReactNode;
  tone?: AdminVisualTone;
}) {
  return (
    <div className={cn("rounded-2xl border p-4", toneStyles[tone])}>
      <p className={cn("text-[10px] font-semibold uppercase tracking-wider", labelStyles[tone])}>
        {label}
      </p>
      <p className="mt-2 text-2xl font-black tracking-tight text-foreground">{value}</p>
      {helper ? <p className="mt-1 text-xs leading-5 text-muted">{helper}</p> : null}
    </div>
  );
}

export function AdminFunctionHeader({
  title,
  description,
  tone = "neutral",
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  tone?: AdminVisualTone;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-start justify-between gap-3", className)}>
      <div>
        <h3 className={cn("text-sm font-semibold uppercase tracking-wider", labelStyles[tone])}>
          {title}
        </h3>
        {description ? <p className="mt-1 text-xs leading-5 text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function AdminNotice({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "status" | "danger";
}) {
  return (
    <div className={cn("rounded-2xl border p-4 text-sm", toneStyles[tone], labelStyles[tone])}>
      {children}
    </div>
  );
}
