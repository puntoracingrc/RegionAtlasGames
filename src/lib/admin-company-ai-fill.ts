import { listedCatalog } from "./catalog";
import { missingOpenAiMessage, openAiConfigured, openAiJson } from "./admin-ai-fill";
import { getGameDetails } from "./indexes";
import type { CompanyRelation } from "./types";

export type AdminCompanyAiTarget = "history" | "logo" | "website" | "years" | "relations" | "seo";

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
  parentCompany?: CompanyRelation | null;
  acquiredByCompany?: CompanyRelation | null;
  mergedWithCompany?: CompanyRelation | null;
  predecessorCompany?: CompanyRelation | null;
  successorCompany?: CompanyRelation | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  companyCandidates?: CompanyRelation[];
  targets?: AdminCompanyAiTarget[];
};

export type AdminCompanyAiPatch = {
  history?: string | null;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  foundedYear?: number | null;
  closedYear?: number | null;
  status?: "active" | "defunct" | "subsidiary" | "unknown";
  parentCompany?: CompanyRelation | null;
  acquiredByCompany?: CompanyRelation | null;
  mergedWithCompany?: CompanyRelation | null;
  predecessorCompany?: CompanyRelation | null;
  successorCompany?: CompanyRelation | null;
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

function normalizeRelationText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function relationFromAiValue(
  value: unknown,
  candidates: CompanyRelation[],
  currentSlug: string,
  currentName: string,
): CompanyRelation | null {
  if (!value) return null;
  const raw =
    typeof value === "string"
      ? value
      : typeof value === "object"
        ? String((value as { slug?: unknown; name?: unknown }).slug ?? (value as { name?: unknown }).name ?? "")
        : "";
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const wanted = normalizeRelationText(trimmed);
  const currentNameKey = normalizeRelationText(currentName);
  const match = candidates.find((candidate) => {
    if (candidate.slug === currentSlug) return false;
    if (normalizeRelationText(candidate.name) === currentNameKey) return false;
    return normalizeRelationText(candidate.slug) === wanted || normalizeRelationText(candidate.name) === wanted;
  });
  return match ? { slug: match.slug, name: match.name } : null;
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

type CompanySearchResult = {
  title: string;
  url: string;
  snippet: string;
  source: string;
  excerpt?: string;
};

const COMPANY_REFERENCE_DOMAINS = [
  "wikipedia.org",
  "wikidata.org",
  "company-information.service.gov.uk",
  "gamefaqs.gamespot.com",
  "giantbomb.com",
  "rawg.io",
  "mobygames.com",
];

const COMPANY_SEARCH_BLOCKED_HOSTS = new Set([
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "tiktok.com",
  "reddit.com",
]);

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function isUsefulCompanySearchResult(url: string): boolean {
  const hostname = hostnameOf(url);
  if (!hostname) return false;
  if (COMPANY_SEARCH_BLOCKED_HOSTS.has(hostname)) return false;
  return true;
}

function serpApiConfigured(): boolean {
  return Boolean((process.env.SERPAPI_API_KEY ?? process.env.SERPAPI_KEY)?.trim());
}

function serpApiKey(): string {
  return (process.env.SERPAPI_API_KEY ?? process.env.SERPAPI_KEY ?? "").trim();
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchCompanyReferenceExcerpt(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "RegionAtlasGames/1.0 (admin company ai)" },
      signal: AbortSignal.timeout(16_000),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;
    const text = stripHtmlToText(await res.text());
    return text.length >= 80 ? clip(text, 2200) : null;
  } catch {
    return null;
  }
}

function isPriorityCompanyReference(url: string): boolean {
  const hostname = hostnameOf(url);
  return COMPANY_REFERENCE_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

async function addCompanyReferenceExcerpts(results: CompanySearchResult[]): Promise<CompanySearchResult[]> {
  const enriched: CompanySearchResult[] = [];
  let fetched = 0;
  for (const result of results) {
    if (fetched >= 5 || !isPriorityCompanyReference(result.url)) {
      enriched.push(result);
      continue;
    }
    const excerpt = await fetchCompanyReferenceExcerpt(result.url);
    enriched.push(excerpt ? { ...result, excerpt } : result);
    fetched += 1;
  }
  return enriched;
}

function companySearchResultScore(result: CompanySearchResult, websiteUrl?: string | null): number {
  const hostname = hostnameOf(result.url);
  const officialHostname = websiteUrl ? hostnameOf(websiteUrl) : "";
  if (officialHostname && (hostname === officialHostname || hostname.endsWith(`.${officialHostname}`))) return 100;
  if (hostname === "wikipedia.org" || hostname.endsWith(".wikipedia.org")) return 92;
  if (hostname === "wikidata.org" || hostname.endsWith(".wikidata.org")) return 88;
  if (hostname === "company-information.service.gov.uk") return 82;
  if (hostname === "giantbomb.com" || hostname.endsWith(".giantbomb.com")) return 72;
  if (hostname === "rawg.io" || hostname.endsWith(".rawg.io")) return 68;
  if (hostname === "gamefaqs.gamespot.com") return 64;
  if (hostname === "mobygames.com" || hostname.endsWith(".mobygames.com")) return 35;
  return 55;
}

async function searchCompanyWebWithSerpApi(name: string, websiteUrl?: string | null): Promise<CompanySearchResult[]> {
  const apiKey = serpApiKey();
  if (!apiKey) return [];
  const websiteHostname = websiteUrl ? hostnameOf(websiteUrl) : "";
  const queries = [
    websiteHostname ? `site:${websiteHostname} "${name}"` : null,
    `"${name}" video game company official website`,
    `"${name}" site:wikipedia.org`,
    `"${name}" video game company founded acquired merged closed`,
    `"${name}" videojuegos empresa historia fundación`,
    `"${name}" site:giantbomb.com`,
    `"${name}" site:rawg.io`,
    `"${name}" site:mobygames.com/company`,
    `"${name}" MobyGames company`,
  ].filter((query): query is string => Boolean(query));
  const byUrl = new Map<string, CompanySearchResult>();
  for (const query of queries) {
    const params = new URLSearchParams({
      engine: "google",
      q: query,
      api_key: apiKey,
      google_domain: "google.es",
      gl: "es",
      hl: "es",
      num: "6",
    });
    const res = await fetch(`https://serpapi.com/search.json?${params}`, {
      headers: { "User-Agent": "RegionAtlasGames/1.0 (admin company ai)" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) continue;
    const data = (await res.json()) as {
      organic_results?: Array<{ title?: string; link?: string; snippet?: string; source?: string }>;
    };
    for (const result of data.organic_results ?? []) {
      if (!result.link || !isUsefulCompanySearchResult(result.link)) continue;
      if (byUrl.has(result.link)) continue;
      byUrl.set(result.link, {
        title: result.title?.trim() || hostnameOf(result.link),
        url: result.link,
        snippet: result.snippet?.trim() || "",
        source: result.source?.trim() || hostnameOf(result.link),
      });
    }
  }
  const sortedResults = [...byUrl.values()].sort(
    (a, b) => companySearchResultScore(b, websiteUrl) - companySearchResultScore(a, websiteUrl),
  );
  const primaryResults = sortedResults.slice(0, 8);
  const mobyFallback = sortedResults.find((result) => hostnameOf(result.url).endsWith("mobygames.com"));
  const withMobyConfirmation =
    mobyFallback && !primaryResults.some((result) => result.url === mobyFallback.url)
      ? [...primaryResults, mobyFallback]
      : primaryResults;
  return addCompanyReferenceExcerpts(withMobyConfirmation);
}

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

  const targets = new Set(input.targets?.length ? input.targets : ["history", "logo", "website", "years", "relations", "seo"]);
  const logs = [`Preparando IA para ${input.name}.`];
  const context = companyCatalogContext(input.slug, input.name);
  const reference = await searchWikipediaCompany(input.name).catch(() => null);
  if (reference?.wikipediaTitle) logs.push(`Wikipedia consultada: ${reference.wikipediaTitle}.`);
  const searchResults = await searchCompanyWebWithSerpApi(
    input.name,
    input.websiteUrl || reference?.officialWebsite,
  ).catch(() => []);
  if (searchResults.length) {
    logs.push(`SerpAPI: ${searchResults.length} resultado(s) web usados como apoyo.`);
    for (const result of searchResults.slice(0, 6)) {
      logs.push(
        `Fuente apoyo: ${result.source} · ${result.title} · ${result.url}${
          result.excerpt ? " · extracto leído" : ""
        }`,
      );
    }
  } else if (!serpApiConfigured()) {
    logs.push("SerpAPI no configurada; usando Wikipedia/Wikidata y catálogo.");
  }
  const system =
    "Eres editor de un catálogo de videojuegos. Responde SOLO JSON válido. " +
    "Estás completando una ficha de COMPAÑÍA, no de un juego. Prioriza web oficial, Wikipedia/Wikidata y fuentes corporativas o editoriales fiables; contrasta con otras bases de datos cuando existan. " +
    "Usa MobyGames como fuente de confirmación para datos factuales estructurados —fechas, nombres, plataformas, roles, publishers, developers, cambios de nombre y relaciones corporativas—, preferiblemente contrastando con otras fuentes. " +
    "No uses textos narrativos de MobyGames como base para traducir, reescribir o parafrasear; history debe redactarse desde cero con hechos contrastados y estilo propio de Region Atlas Games. " +
    "Rellena únicamente con datos verificables o inferencias prudentes desde varias señales del contexto. " +
    "No inventes fechas si no tienes seguridad. Detecta fundación, cierre, fusiones, absorciones, compras, cambios de nombre, matriz o sucesora si las fuentes lo indican. " +
    "Para relaciones corporativas usa solo compañías que existan en el listado de compañías candidatas. Devuelve null si no encuentras una coincidencia clara. " +
    "parentCompany es empresa matriz actual o más directa; acquiredByCompany es compradora o absorbente; mergedWithCompany es compañía con la que se fusionó; predecessorCompany es entidad anterior directa; successorCompany es nombre/entidad posterior directa. " +
    "foundedYear debe ser el año en que empezó la compañía o marca canónica que estás editando; si una compañía actual nace por fusión, usa el año de esa fusión y menciona las raíces anteriores en history. " +
    "No escribas 'fue fundada en YEAR' usando el año de una predecesora si la entidad actual nació después por fusión, compra o cambio de nombre; formula esas raíces como antecedentes. " +
    "No menciones años de fundación de predecesoras salvo que estén confirmados de forma clara por varias fuentes; si dudas, omite esos años y conserva solo la relación histórica. " +
    "Si una compañía heredó activos tras una quiebra o cambio legal, diferencia en history la empresa original, la sucesora y el uso actual del nombre. " +
    "Para websiteUrl usa solo web oficial clara. Para logoUrl usa una URL pública oficial o null. " +
    "history debe ser texto original en español, útil para una sección pública 'Sobre la compañía'. " +
    "No copies la estructura ni frases exactas de Wikipedia, MobyGames, tiendas, bases de datos ni webs oficiales: resume y reescribe con tus propias palabras para Region Atlas Games. " +
    "Si dos fuentes discrepan, prioriza el dato más concreto e indica en el texto solo lo que esté suficientemente sustentado; si no, omite. " +
    "No uses elogios vacíos o promocionales como 'líder', 'destacada', 'actor clave', 'icónica', 'aclamada', 'reconocida', 'emblemática', 'famosa' o 'influyente'; usa formulaciones neutrales y concretas. " +
    "seoTitle y seoDescription deben ser naturales, sin keyword stuffing ni adjetivos promocionales. " +
    'Campos posibles: {"history":string|null,"logoUrl":string|null,"websiteUrl":string|null,"foundedYear":number|null,"closedYear":number|null,"status":"active|defunct|subsidiary|unknown","parentCompany":"nombre o slug"|null,"acquiredByCompany":"nombre o slug"|null,"mergedWithCompany":"nombre o slug"|null,"predecessorCompany":"nombre o slug"|null,"successorCompany":"nombre o slug"|null,"seoTitle":string|null,"seoDescription":string|null}.';
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
        parentCompany: input.parentCompany,
        acquiredByCompany: input.acquiredByCompany,
        mergedWithCompany: input.mergedWithCompany,
        predecessorCompany: input.predecessorCompany,
        successorCompany: input.successorCompany,
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
      },
      null,
      2,
    )}\n\nReferencia Wikipedia/Wikidata:\n${JSON.stringify(reference, null, 2)}\n\nResultados web SerpAPI:\n${JSON.stringify(
      searchResults,
      null,
      2,
    )}\n\nCompañías candidatas para relaciones:\n${JSON.stringify(
      (input.companyCandidates ?? []).slice(0, 500),
      null,
      2,
    )}\n\nJuegos relacionados en Region Atlas:\n${context}`;

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
    patch.foundedYear = numberOrNull(parsed.foundedYear) ?? reference?.foundedYear ?? null;
    patch.closedYear = numberOrNull(parsed.closedYear) ?? reference?.closedYear ?? null;
    patch.status = statusOrUnknown(parsed.status);
    logs.push("Años y estado revisados.");
  }
  if (targets.has("relations")) {
    const candidates = input.companyCandidates ?? [];
    patch.parentCompany = relationFromAiValue(parsed.parentCompany, candidates, input.slug, input.name);
    patch.acquiredByCompany = relationFromAiValue(parsed.acquiredByCompany, candidates, input.slug, input.name);
    patch.mergedWithCompany = relationFromAiValue(parsed.mergedWithCompany, candidates, input.slug, input.name);
    patch.predecessorCompany = relationFromAiValue(parsed.predecessorCompany, candidates, input.slug, input.name);
    patch.successorCompany = relationFromAiValue(parsed.successorCompany, candidates, input.slug, input.name);
    logs.push("Relaciones corporativas revisadas.");
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
