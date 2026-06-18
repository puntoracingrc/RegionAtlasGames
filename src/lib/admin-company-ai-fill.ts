import { listedCatalog } from "./catalog";
import { missingOpenAiMessage, openAiConfigured, openAiJson } from "./admin-ai-fill";
import { getGameDetails } from "./indexes";

export type AdminCompanyAiTarget = "history" | "logo" | "website" | "years" | "seo";

export type AdminCompanyAiInput = {
  slug: string;
  name: string;
  gameCount: number;
  history?: string | null;
  logoUrl?: string | null;
  websiteUrl?: string | null;
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
  websiteUrl?: string | null;
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

function firstWikidataStringClaim(entity: WikidataEntity | null, property: string): string | null {
  const value = entity?.claims?.[property]?.[0]?.mainsnak?.datavalue?.value;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstWikidataYearClaim(entity: WikidataEntity | null, property: string): number | null {
  const value = entity?.claims?.[property]?.[0]?.mainsnak?.datavalue?.value;
  if (!value || typeof value !== "object") return null;
  const time = (value as { time?: unknown }).time;
  if (typeof time !== "string") return null;
  const match = time.match(/[+-]?(\d{4})/);
  return match ? Number.parseInt(match[1], 10) : null;
}

type WikidataEntity = {
  claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>>;
};

type CompanyReference = {
  wikipediaTitle?: string | null;
  wikipediaUrl?: string | null;
  wikidataId?: string | null;
  officialWebsite?: string | null;
  foundedYear?: number | null;
  closedYear?: number | null;
  extract?: string | null;
};

async function searchWikipediaCompany(name: string): Promise<CompanyReference | null> {
  const searchParams = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: `${name} videojuego empresa`,
    srlimit: "3",
    format: "json",
    origin: "*",
  });
  const searchRes = await fetch(`https://es.wikipedia.org/w/api.php?${searchParams}`, {
    headers: { "User-Agent": "RegionAtlasGames/1.0 (admin company ai)" },
  });
  if (!searchRes.ok) return null;
  const searchData = (await searchRes.json()) as { query?: { search?: Array<{ title?: string }> } };
  const title = searchData.query?.search?.find((item) => item.title)?.title;
  if (!title) return null;

  const pageParams = new URLSearchParams({
    action: "query",
    prop: "extracts|pageprops|info",
    exintro: "1",
    explaintext: "1",
    inprop: "url",
    titles: title,
    format: "json",
    origin: "*",
  });
  const pageRes = await fetch(`https://es.wikipedia.org/w/api.php?${pageParams}`, {
    headers: { "User-Agent": "RegionAtlasGames/1.0 (admin company ai)" },
  });
  if (!pageRes.ok) return null;
  const pageData = (await pageRes.json()) as {
    query?: {
      pages?: Record<
        string,
        { title?: string; extract?: string; fullurl?: string; pageprops?: { wikibase_item?: string } }
      >;
    };
  };
  const page = Object.values(pageData.query?.pages ?? {})[0];
  if (!page?.title) return null;

  let wikidataEntity: WikidataEntity | null = null;
  const wikidataId = page.pageprops?.wikibase_item ?? null;
  if (wikidataId) {
    const entityRes = await fetch(
      `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(wikidataId)}.json`,
      { headers: { "User-Agent": "RegionAtlasGames/1.0 (admin company ai)" } },
    );
    if (entityRes.ok) {
      const entityData = (await entityRes.json()) as { entities?: Record<string, WikidataEntity> };
      wikidataEntity = entityData.entities?.[wikidataId] ?? null;
    }
  }

  return {
    wikipediaTitle: page.title,
    wikipediaUrl: page.fullurl ?? `https://es.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
    wikidataId,
    officialWebsite: firstWikidataStringClaim(wikidataEntity, "P856"),
    foundedYear: firstWikidataYearClaim(wikidataEntity, "P571"),
    closedYear: firstWikidataYearClaim(wikidataEntity, "P576"),
    extract: page.extract?.trim() ?? null,
  };
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

  const targets = new Set(input.targets?.length ? input.targets : ["history", "logo", "website", "years", "seo"]);
  const logs = [`Preparando IA para ${input.name}.`];
  const context = companyCatalogContext(input.slug, input.name);
  const reference = await searchWikipediaCompany(input.name).catch(() => null);
  if (reference?.wikipediaTitle) logs.push(`Wikipedia consultada: ${reference.wikipediaTitle}.`);
  const system =
    "Eres editor de un catálogo de videojuegos. Responde SOLO JSON válido. " +
    "Estás completando una ficha de COMPAÑÍA, no de un juego. Prioriza Wikipedia/Wikidata y la web oficial si aparece. " +
    "Rellena únicamente con datos verificables o inferencias prudentes desde el contexto. " +
    "No inventes fechas si no tienes seguridad. Para websiteUrl usa solo web oficial clara. Para logoUrl usa una URL pública oficial o null. " +
    "history debe ser texto original en español, útil para una sección pública 'Sobre la compañía'. " +
    "seoTitle y seoDescription deben ser naturales, sin keyword stuffing. " +
    'Campos posibles: {"history":string|null,"logoUrl":string|null,"websiteUrl":string|null,"foundedYear":number|null,"closedYear":number|null,"status":"active|defunct|subsidiary|unknown","seoTitle":string|null,"seoDescription":string|null}.';
  const user =
    `Compañía: ${input.name}\nSlug: ${input.slug}\nJuegos en índice: ${input.gameCount}\n` +
    `Campos pedidos: ${Array.from(targets).join(", ")}\n` +
    `Valores actuales:\n${JSON.stringify(
      {
        history: input.history,
        logoUrl: input.logoUrl,
        websiteUrl: input.websiteUrl,
        foundedYear: input.foundedYear,
        closedYear: input.closedYear,
        status: input.status,
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
      },
      null,
      2,
    )}\n\nReferencia Wikipedia/Wikidata:\n${JSON.stringify(reference, null, 2)}\n\nJuegos relacionados en Region Atlas:\n${context}`;

  const parsed = await openAiJson(system, user);
  const patch: AdminCompanyAiPatch = {};

  if (targets.has("website")) {
    const website = reference?.officialWebsite || (typeof parsed.websiteUrl === "string" ? parsed.websiteUrl.trim() : "");
    if (/^https?:\/\//i.test(website)) {
      patch.websiteUrl = website;
      logs.push("Web oficial detectada.");
    }
  }
  if (targets.has("history") && typeof parsed.history === "string" && parsed.history.trim().length >= 40) {
    patch.history = parsed.history.trim().slice(0, 1800);
    logs.push("Historia generada.");
  }
  if (targets.has("logo") && typeof parsed.logoUrl === "string" && /^https?:\/\//i.test(parsed.logoUrl.trim())) {
    patch.logoUrl = parsed.logoUrl.trim();
    logs.push("Logo sugerido.");
  }
  if (targets.has("years")) {
    patch.foundedYear = reference?.foundedYear ?? numberOrNull(parsed.foundedYear);
    patch.closedYear = reference?.closedYear ?? numberOrNull(parsed.closedYear);
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
