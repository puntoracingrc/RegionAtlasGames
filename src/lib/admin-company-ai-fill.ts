import { listedCatalog } from "./catalog";
import { missingOpenAiMessage, openAiConfigured, openAiJson } from "./admin-ai-fill";
import { getGameDetails } from "./indexes";

export type AdminCompanyAiTarget = "history" | "logo" | "years" | "seo";

export type AdminCompanyAiInput = {
  slug: string;
  name: string;
  gameCount: number;
  history?: string | null;
  logoUrl?: string | null;
  foundedYear?: number | null;
  closedYear?: number | null;
  status?: "active" | "defunct" | "subsidiary" | "unknown";
  seoTitle?: string | null;
  seoDescription?: string | null;
  targets?: AdminCompanyAiTarget[];
};

export type AdminCompanyAiPatch = {
  history?: string | null;
  logoUrl?: string | null;
  foundedYear?: number | null;
  closedYear?: number | null;
  status?: "active" | "defunct" | "subsidiary" | "unknown";
  seoTitle?: string | null;
  seoDescription?: string | null;
};

function clip(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const year = Math.trunc(value);
  return year >= 1800 && year <= new Date().getFullYear() + 2 ? year : null;
}

function statusOrUnknown(value: unknown): AdminCompanyAiPatch["status"] {
  return value === "active" || value === "defunct" || value === "subsidiary" ? value : "unknown";
}

function companyCatalogContext(slug: string, name: string): string {
  const key = slug.trim();
  const nameKey = name.trim().toLowerCase();
  const games = listedCatalog
    .filter((game) => {
      const details = getGameDetails(game.id);
      return (
        details?.developer?.slug === key ||
        details?.publisher?.slug === key ||
        details?.developer?.name?.toLowerCase() === nameKey ||
        details?.publisher?.name?.toLowerCase() === nameKey
      );
    })
    .slice(0, 80)
    .map((game) => {
      const details = getGameDetails(game.id);
      const roles = [
        details?.developer?.slug === key || details?.developer?.name?.toLowerCase() === nameKey
          ? "desarrolladora"
          : null,
        details?.publisher?.slug === key || details?.publisher?.name?.toLowerCase() === nameKey
          ? "editora"
          : null,
      ].filter(Boolean);
      return `${game.title} (${game.platformSlug}, ${game.region}) · ${roles.join(" y ") || "relacionada"}`;
    });

  return games.length ? games.join("\n") : "Sin juegos relacionados detectados en el catálogo actual.";
}

export async function fillAdminCompanyWithAi(input: AdminCompanyAiInput): Promise<
  | { ok: true; patch: AdminCompanyAiPatch; logs: string[] }
  | { error: string }
> {
  if (!openAiConfigured()) return { error: missingOpenAiMessage() };

  const targets = new Set(input.targets?.length ? input.targets : ["history", "logo", "years", "seo"]);
  const logs = [`Preparando IA para ${input.name}.`];
  const context = companyCatalogContext(input.slug, input.name);
  const system =
    "Eres editor de un catálogo de videojuegos. Responde SOLO JSON válido. " +
    "Rellena únicamente con datos verificables o inferencias prudentes desde el contexto. " +
    "No inventes fechas si no tienes seguridad. Para logoUrl usa una URL pública oficial o null. " +
    "history debe ser texto original en español, útil para una sección pública 'Sobre la compañía'. " +
    "seoTitle y seoDescription deben ser naturales, sin keyword stuffing. " +
    'Campos posibles: {"history":string|null,"logoUrl":string|null,"foundedYear":number|null,"closedYear":number|null,"status":"active|defunct|subsidiary|unknown","seoTitle":string|null,"seoDescription":string|null}.';
  const user =
    `Compañía: ${input.name}\nSlug: ${input.slug}\nJuegos en índice: ${input.gameCount}\n` +
    `Campos pedidos: ${Array.from(targets).join(", ")}\n` +
    `Valores actuales:\n${JSON.stringify(
      {
        history: input.history,
        logoUrl: input.logoUrl,
        foundedYear: input.foundedYear,
        closedYear: input.closedYear,
        status: input.status,
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
      },
      null,
      2,
    )}\n\nJuegos relacionados en Region Atlas:\n${context}`;

  const parsed = await openAiJson(system, user);
  const patch: AdminCompanyAiPatch = {};

  if (targets.has("history") && typeof parsed.history === "string" && parsed.history.trim().length >= 40) {
    patch.history = parsed.history.trim().slice(0, 1800);
    logs.push("Historia generada.");
  }
  if (targets.has("logo") && typeof parsed.logoUrl === "string" && /^https?:\/\//i.test(parsed.logoUrl.trim())) {
    patch.logoUrl = parsed.logoUrl.trim();
    logs.push("Logo sugerido.");
  }
  if (targets.has("years")) {
    patch.foundedYear = numberOrNull(parsed.foundedYear);
    patch.closedYear = numberOrNull(parsed.closedYear);
    patch.status = statusOrUnknown(parsed.status);
    logs.push("Años y estado revisados.");
  }
  if (targets.has("seo")) {
    if (typeof parsed.seoTitle === "string" && parsed.seoTitle.trim()) {
      patch.seoTitle = clip(parsed.seoTitle, 70);
    }
    if (typeof parsed.seoDescription === "string" && parsed.seoDescription.trim()) {
      patch.seoDescription = clip(parsed.seoDescription, 160);
    }
    logs.push("SEO generado.");
  }

  return { ok: true, patch, logs };
}
