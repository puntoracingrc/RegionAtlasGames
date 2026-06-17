export function formatGameReleaseDate(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  const raw = value.trim();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Madrid",
  }).format(date);
}

export function defaultSupportForPlatform(platformSlug: string): string | null {
  const normalized = platformSlug.trim().toLowerCase();
  const labels: Record<string, string> = {
    ps5: "PS5",
    ps4: "PS4",
    ps3: "PS3",
    ps2: "PS2",
    ps1: "PlayStation",
    switch: "Nintendo Switch",
    "switch-2": "Nintendo Switch 2",
    xboxseries: "Xbox Series",
    xboxone: "Xbox One",
  };
  return labels[normalized] ?? null;
}

export function cleanSupportLabel(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "—" || trimmed === "...") return null;
  return trimmed;
}

export function formatPlayerCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value === 1 ? "1 jugador" : `${value} jugadores`;
}
