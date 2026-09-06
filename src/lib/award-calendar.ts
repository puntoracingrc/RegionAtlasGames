import type { AwardEdition } from "./award-research-types";

export type AwardTemporalState = "future" | "today" | "awaiting_results" | "completed";

// RegionAtlas displays calendar days in its Spanish public timezone.
export function awardCalendarDay(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function getAwardTemporalState(edition: AwardEdition, today: string): AwardTemporalState | null {
  if (edition.status === "completed" || edition.status === "corrected") return "completed";
  if (!edition.ceremonyDate) return null;
  if (edition.ceremonyDate > today) return "future";
  return edition.ceremonyDate === today ? "today" : "awaiting_results";
}

export function pendingAwardEditions(editions: AwardEdition[], today: string) {
  return editions.filter(e => ["today", "awaiting_results"].includes(getAwardTemporalState(e, today) ?? ""))
    .sort((a, b) => a.ceremonyDate!.localeCompare(b.ceremonyDate!) || a.id.localeCompare(b.id));
}

export function awardUpdateInstruction(name: string, edition: AwardEdition, officialUrl: string) {
  return `Actualiza los resultados de ${name} ${edition.editionYear} en RegionAtlas. Fecha de ceremonia: ${edition.ceremonyDate}. Fuente oficial: ${edition.officialUrl ?? officialUrl}. Investiga primero los resultados en la fuente oficial, incorpora ganadores y categorías sin asociaciones automáticas, resuelve únicamente identidades verificables, ejecuta awards:check y los tests y publica si todo es correcto.`;
}
