import { createHash } from "node:crypto";
import { assertSafeResearchUrl, type ResearchDnsLookup } from "./url-security";
import { canonicalImageUrl, sourceRecordIdFromUrl } from "./physical-evidence";
import type { ResearchImageCandidate, ResearchPage, ResearchPageFetcher } from "./v2-types";

const USER_AGENT = "RegionAtlasResearchEngine/2.0 (+https://www.regionatlas.games/)";

export type HttpResearchPageFetcherOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  fetchImpl?: typeof fetch;
  resolver?: ResearchDnsLookup;
};

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function stripHtml(html: string): string {
  return decodeHtml(html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function attribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match ? decodeHtml(match[1].trim()) : null;
}

function safeResolvedUrl(value: string | null, base: string): string | null {
  if (!value) return null;
  try {
    const resolved = new URL(value, base);
    return ['http:', 'https:'].includes(resolved.protocol) ? resolved.toString() : null;
  } catch {
    return null;
  }
}

function titleFromHtml(html: string): string {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]).slice(0, 500) : "";
}

function canonicalFromHtml(html: string, base: string): string {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attribute(tag, "rel")?.toLowerCase().split(/\s+/) ?? [];
    if (rel.includes("canonical")) return safeResolvedUrl(attribute(tag, "href"), base) ?? base;
  }
  return base;
}

function linksFromHtml(html: string, base: string): string[] {
  const links = (html.match(/<a\b[^>]*>/gi) ?? []).flatMap((tag) => {
    const value = safeResolvedUrl(attribute(tag, "href"), base);
    return value ? [value] : [];
  });
  return [...new Set(links)].slice(0, 400);
}

function srcsetUrls(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").map((candidate) => candidate.trim().split(/\s+/)[0]).filter(Boolean);
}

function jsonLdImageValueUrls(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(jsonLdImageValueUrls);
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  return [row.url, row.contentUrl, row.thumbnailUrl].flatMap(jsonLdImageValueUrls);
}

function jsonLdImageUrls(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(jsonLdImageUrls);
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  const ownImageObject = String(row["@type"] ?? "").toLowerCase() === "imageobject"
    ? jsonLdImageValueUrls(row)
    : [];
  return [...ownImageObject, ...jsonLdImageValueUrls(row.image), ...jsonLdImageUrls(row["@graph"])];
}

function listingIdFromPage(base: string): string | null {
  return sourceRecordIdFromUrl(base);
}

function imageCandidate(input: {
  value: string | null;
  base: string;
  thumbnailUrl?: string | null;
  originalUrl?: string | null;
  alt?: string | null;
  caption?: string | null;
  label?: string | null;
  mechanism: string;
}): ResearchImageCandidate | null {
  if (!input.value || /(?:\$?\{|\}|%7b|%7d|%24%7b)/i.test(input.value)) return null;
  const resolved = safeResolvedUrl(input.value, input.base);
  if (!resolved) return null;
  const thumbnailUrl = safeResolvedUrl(input.thumbnailUrl ?? null, input.base);
  const originalUrl = safeResolvedUrl(input.originalUrl ?? null, input.base);
  const selected = originalUrl ?? resolved;
  return {
    url: selected,
    thumbnailUrl,
    originalUrl,
    resolvedUrl: selected,
    canonicalUrl: canonicalImageUrl(selected),
    alt: input.alt ?? null,
    caption: input.caption ?? null,
    galleryLabel: input.label ?? input.caption ?? input.alt ?? null,
    sourcePageUrl: input.base,
    sourceRecordId: sourceRecordIdFromUrl(selected),
    listingId: listingIdFromPage(input.base),
    acquisitionMechanisms: [input.mechanism],
  };
}

function imagesFromHtml(html: string, base: string, structuredData: unknown[]): ResearchPage["imageCandidates"] {
  const images: ResearchImageCandidate[] = [];
  const linkedImages = new Map<string, string>();
  for (const match of html.matchAll(/<a\b([^>]*)>[\s\S]{0,2500}?(<img\b[^>]*>)[\s\S]{0,2500}?<\/a>/gi)) {
    const imgTag = match[2];
    const href = safeResolvedUrl(attribute(`<a ${match[1]}>`, "href"), base);
    if (href && /\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i.test(href)) linkedImages.set(imgTag, href);
  }
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const alt = attribute(tag, "alt");
    const caption = attribute(tag, "title");
    const thumbnail = attribute(tag, "src") ?? attribute(tag, "data-src");
    const explicitOriginal = attribute(tag, "data-image-url")
      ?? attribute(tag, "data-original")
      ?? attribute(tag, "data-zoom")
      ?? attribute(tag, "data-zoom-image")
      ?? attribute(tag, "data-large")
      ?? attribute(tag, "data-full")
      ?? linkedImages.get(tag)
      ?? null;
    const sources: Array<{ value: string | null; mechanism: string }> = [
      { value: explicitOriginal, mechanism: linkedImages.has(tag) ? "ancestor-a.href" : "img.data-original" },
      { value: thumbnail, mechanism: "img.src" },
      ...srcsetUrls(attribute(tag, "srcset") ?? attribute(tag, "data-srcset")).map((value) => ({ value, mechanism: "img.srcset" })),
    ];
    for (const source of sources) {
      const candidate = imageCandidate({ value: source.value, base, thumbnailUrl: thumbnail, originalUrl: explicitOriginal, alt, caption, mechanism: source.mechanism });
      if (candidate) images.push(candidate);
    }
  }
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const property = (attribute(tag, "property") ?? attribute(tag, "name"))?.toLowerCase();
    if (!["og:image", "og:image:url", "twitter:image", "twitter:image:src"].includes(property ?? "")) continue;
    const candidate = imageCandidate({ value: attribute(tag, "content"), base, alt: property ?? null, mechanism: property ?? "meta-image" });
    if (candidate) images.push(candidate);
  }
  for (const candidate of structuredData.flatMap(jsonLdImageUrls)) {
    const row = imageCandidate({ value: candidate, base, alt: "JSON-LD image", mechanism: "json-ld.image" });
    if (row) images.push(row);
  }
  for (const script of html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) ?? []) {
    for (const match of script.matchAll(/https?:\\?\/\\?\/[^"'\s<>]+?\.(?:avif|gif|jpe?g|png|webp)(?:\?[^"'\s<>]*)?/gi)) {
      const value = match[0].replace(/\\\//g, "/").replace(/\\u0026/g, "&");
      const candidate = imageCandidate({ value, base, alt: "Embedded gallery image", mechanism: "embedded-state" });
      if (candidate) images.push(candidate);
    }
  }
  const merged = new Map<string, ResearchImageCandidate>();
  for (const image of images) {
    const current = merged.get(image.canonicalUrl);
    merged.set(image.canonicalUrl, current ? {
      ...current,
      thumbnailUrl: current.thumbnailUrl ?? image.thumbnailUrl,
      originalUrl: current.originalUrl ?? image.originalUrl,
      galleryLabel: current.galleryLabel ?? image.galleryLabel,
      acquisitionMechanisms: [...new Set([...current.acquisitionMechanisms, ...image.acquisitionMechanisms])],
    } : image);
  }
  return [...merged.values()].slice(0, 300);
}

function structuredDataFromHtml(html: string): unknown[] {
  const values: unknown[] = [];
  const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      values.push(JSON.parse(decodeHtml(match[1].trim())));
    } catch {
      // Malformed third-party JSON-LD is ignored instead of becoming evidence.
    }
    if (values.length >= 20) break;
  }
  return values;
}

function languageFromHtml(html: string, text: string): string | null {
  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0];
  const declared = htmlTag ? attribute(htmlTag, "lang") : null;
  if (declared) return declared.toLowerCase().split("-")[0];
  const sample = ` ${text.slice(0, 20_000).toLowerCase()} `;
  const counts: Record<string, number> = {
    es: [" el ", " la ", " de ", " para ", " juego "].filter((word) => sample.includes(word)).length,
    en: [" the ", " and ", " for ", " game ", " with "].filter((word) => sample.includes(word)).length,
    fr: [" le ", " la ", " de ", " pour ", " jeu "].filter((word) => sample.includes(word)).length,
    de: [" der ", " die ", " das ", " spiel ", " mit "].filter((word) => sample.includes(word)).length,
  };
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[1] > 1 && ranked[0][1] > (ranked[1]?.[1] ?? 0) ? ranked[0][0] : null;
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("RESEARCH_PAGE_TOO_LARGE");
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error("RESEARCH_PAGE_TOO_LARGE");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export class HttpResearchPageFetcher implements ResearchPageFetcher {
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly maxRedirects: number;
  private readonly fetchImpl: typeof fetch;
  private readonly resolver?: ResearchDnsLookup;

  constructor(options: HttpResearchPageFetcherOptions = {}) {
    this.timeoutMs = Math.max(1_000, Math.min(60_000, options.timeoutMs ?? 12_000));
    this.maxBytes = Math.max(16_384, Math.min(10_000_000, options.maxBytes ?? 2_000_000));
    this.maxRedirects = Math.max(0, Math.min(8, options.maxRedirects ?? 4));
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.resolver = options.resolver;
  }

  async fetch(value: string): Promise<ResearchPage> {
    const requested = await assertSafeResearchUrl(value, this.resolver);
    let current = requested;
    let response: Response | null = null;
    for (let redirect = 0; redirect <= this.maxRedirects; redirect += 1) {
      response = await this.fetchImpl(current, {
        redirect: "manual",
        cache: "no-store",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.8,*/*;q=0.2",
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location) throw new Error("RESEARCH_REDIRECT_WITHOUT_LOCATION");
      if (redirect === this.maxRedirects) throw new Error("RESEARCH_TOO_MANY_REDIRECTS");
      current = await assertSafeResearchUrl(new URL(location, current).toString(), this.resolver);
    }
    if (!response) throw new Error("RESEARCH_FETCH_FAILED");
    if (response.status < 200 || response.status >= 400) throw new Error(`RESEARCH_PAGE_HTTP_${response.status}`);
    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    if (!contentType.startsWith("text/") && !["application/json", "application/xhtml+xml"].includes(contentType)) {
      throw new Error(`RESEARCH_UNSUPPORTED_CONTENT_TYPE:${contentType || "unknown"}`);
    }
    const bytes = await readLimitedBody(response, this.maxBytes);
    const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const isHtml = contentType.includes("html") || /^\s*<!?html/i.test(raw);
    const text = isHtml ? stripHtml(raw) : raw.replace(/\s+/g, " ").trim();
    const finalUrl = response.url || current.toString();
    const declaredCanonical = isHtml ? canonicalFromHtml(raw, finalUrl) : finalUrl;
    const canonicalUrl = await assertSafeResearchUrl(declaredCanonical, this.resolver)
      .then((url) => url.toString())
      .catch(() => finalUrl);
    const structuredData = isHtml ? structuredDataFromHtml(raw) : [];
    return {
      requestedUrl: requested.toString(),
      canonicalUrl,
      status: response.status,
      title: isHtml ? titleFromHtml(raw) : "",
      text: text.slice(0, 300_000),
      language: isHtml ? languageFromHtml(raw, text) : null,
      structuredData,
      links: isHtml ? linksFromHtml(raw, finalUrl) : [],
      imageCandidates: isHtml ? imagesFromHtml(raw, finalUrl, structuredData) : [],
      fetchedAt: new Date().toISOString(),
      contentType,
      bytes: bytes.byteLength,
    };
  }
}

export function researchPageTextHash(page: Pick<ResearchPage, "canonicalUrl" | "text">): string {
  return createHash("sha256").update(`${page.canonicalUrl}\n${page.text}`).digest("hex");
}
