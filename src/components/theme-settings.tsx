"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import type { ThemePreference } from "@/lib/session";
import { cn } from "@/lib/cn";

const OPTIONS: { value: ThemePreference; label: string; hint: string }[] = [
  { value: "light", label: "Claro", hint: "Fondo claro, ideal con luz" },
  { value: "dark", label: "Oscuro", hint: "Tema actual por defecto" },
  { value: "system", label: "Sistema", hint: "Sigue la preferencia del dispositivo" },
];

type Props = {
  initialTheme?: ThemePreference;
  onSaved?: () => void;
};

export function ThemeSettings({ initialTheme = "system", onSaved }: Props) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  async function selectTheme(value: ThemePreference) {
    setTheme(value);
    setMessage(null);

    const me = await fetch("/api/auth/me").then((r) => r.json());
    if (!me.user) {
      setMessage("Preferencia guardada en este navegador.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: value }),
      });
      if (res.ok) {
        setMessage("Preferencia guardada en tu cuenta.");
        onSaved?.();
      }
    } finally {
      setSaving(false);
    }
  }

  if (!mounted) {
    return <div className="h-32 animate-pulse rounded-xl bg-card" />;
  }

  const active = (theme as ThemePreference) || initialTheme;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={saving}
            onClick={() => selectTheme(opt.value)}
            className={cn(
              "rounded-xl border p-4 text-left transition",
              active === opt.value
                ? "border-accent/50 bg-accent/10"
                : "border-border bg-card hover:bg-card-hover",
            )}
          >
            <p className="font-medium text-foreground">{opt.label}</p>
            <p className="mt-1 text-xs text-muted">{opt.hint}</p>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">
        Tema activo: <span className="text-foreground">{resolvedTheme === "dark" ? "Oscuro" : "Claro"}</span>
      </p>
      {message && <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}
    </div>
  );
}
