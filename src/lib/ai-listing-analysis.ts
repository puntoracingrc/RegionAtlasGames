import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { get, put } from "@vercel/blob";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";
import { getCatalogGame } from "./catalog";
import type { AiListingAnalysis, MarketplaceListing } from "./marketplace-types";
import { aiQuotaForPlan } from "./plans";
import type { UserPlan } from "./marketplace-types";

const USAGE_FILE = path.join(process.cwd(), "data", "marketplace", "ai-usage.json");
const USAGE_BLOB_PATH = "region-atlas/marketplace/ai-usage.json";

type UsageRow = { userId: string; month: string; count: number };

function monthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function useBlobStorage(): boolean {
  if (process.env.VERCEL) return blobAuthConfigured();
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

async function readUsage(): Promise<UsageRow[]> {
  if (useBlobStorage()) {
    try {
      const auth = await blobAuthOptions("private");
      const result = await get(USAGE_BLOB_PATH, { ...auth, useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) return [];
      return JSON.parse(await new Response(result.stream).text()) as UsageRow[];
    } catch {
      return [];
    }
  }
  try {
    return JSON.parse(readFileSync(USAGE_FILE, "utf-8")) as UsageRow[];
  } catch {
    return [];
  }
}

async function writeUsage(rows: UsageRow[]) {
  if (useBlobStorage()) {
    const auth = await blobAuthOptions("private");
    await put(USAGE_BLOB_PATH, JSON.stringify(rows, null, 2), {
      ...auth,
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 30,
    });
    return;
  }
  const dir = path.dirname(USAGE_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(USAGE_FILE, JSON.stringify(rows, null, 2), "utf-8");
}

export async function getAiUsageCount(userId: string): Promise<number> {
  const key = monthKey();
  return (await readUsage()).find((r) => r.userId === userId && r.month === key)?.count ?? 0;
}

export async function incrementAiUsage(userId: string): Promise<number> {
  const key = monthKey();
  const rows = await readUsage();
  const idx = rows.findIndex((r) => r.userId === userId && r.month === key);
  if (idx === -1) {
    rows.push({ userId, month: key, count: 1 });
  } else {
    rows[idx].count += 1;
  }
  await writeUsage(rows);
  return rows.find((r) => r.userId === userId && r.month === key)!.count;
}

export async function aiQuotaRemaining(userId: string, plan: UserPlan): Promise<number> {
  return Math.max(0, aiQuotaForPlan(plan) - await getAiUsageCount(userId));
}

function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0.8;
  if (n > 1) return Math.max(0.1, Math.min(1, n / 10));
  return Math.max(0.1, Math.min(1, n));
}

function toNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function listingPhotoBlobPath(listingId: string, slot: string): string {
  return `region-atlas/marketplace/listing-photos/${listingId}/${slot}.jpg`;
}

async function privateBlobPhotoDataUrl(listingId: string, slot: string): Promise<string | null> {
  if (!useBlobStorage()) return null;
  try {
    const auth = await blobAuthOptions("private");
    const result = await get(listingPhotoBlobPath(listingId, slot), { ...auth, useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
    return `data:${result.blob.contentType || "image/jpeg"};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

async function photoInputUrl(listing: MarketplaceListing, url: string): Promise<string | null> {
  if (url.startsWith("https://")) return url;
  const apiPhotoMatch = url.match(/^\/api\/marketplace\/listings\/([^/]+)\/photos\/([^/]+)$/);
  if (apiPhotoMatch) {
    return privateBlobPhotoDataUrl(apiPhotoMatch[1] || listing.id, apiPhotoMatch[2]);
  }
  if (!url.startsWith("/listing-photos/")) return null;
  try {
    const buffer = readFileSync(path.join(process.cwd(), "public", url));
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

async function analyzeWithOpenAiVision(
  listing: MarketplaceListing,
  basePrice: number,
): Promise<AiListingAnalysis | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const images = (
    await Promise.all(listing.photos.map((photo) => photoInputUrl(listing, photo.url)))
  )
    .filter((url): url is string => Boolean(url))
    .slice(0, 5);
  if (images.length < 4) return null;

  const content = [
    {
      type: "input_text",
      text:
        "Analiza estas fotos reales de un videojuego físico anunciado en Region Atlas. " +
        "Comprueba si parecen corresponder al juego anunciado, estima estado de conservación, " +
        "detecta desperfectos visibles y recomienda precio orientativo en euros. " +
        "Responde SOLO JSON válido con estas claves: conditionVerdict, conditionScore (0-1), " +
        "estimatedPriceEur, visualDescription, gameMatchVerdict, gameMatchConfidence (0-1), conditionIssues array. " +
        `Juego anunciado: ${listing.title}. Plataforma: ${listing.platformSlug}. Región: ${listing.region}. ` +
        `Precio base de referencia: ${basePrice} €. Precintado indicado por vendedor: ${listing.sealed ? "sí" : "no"}.`,
    },
    ...images.map((imageUrl) => ({
      type: "input_image",
      image_url: imageUrl,
    })),
  ];

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o-mini",
        input: [{ role: "user", content }],
        max_output_tokens: 700,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text =
      data.output_text ??
      data.output
        ?.flatMap((item: { content?: { text?: string }[] }) => item.content ?? [])
        ?.map((item: { text?: string }) => item.text ?? "")
        ?.join("\n") ??
      "";
    const parsed = extractJsonObject(text);
    if (!parsed) return null;

    const conditionScore = clampScore(parsed.conditionScore);
    const estimated = Math.round(toNumber(parsed.estimatedPriceEur, basePrice * conditionScore));
    const issues = Array.isArray(parsed.conditionIssues)
      ? parsed.conditionIssues.map(String).filter(Boolean).slice(0, 6)
      : [];

    return {
      conditionVerdict: String(parsed.conditionVerdict ?? "Estado revisado por IA"),
      conditionScore,
      estimatedPriceEur: estimated,
      visualDescription: String(parsed.visualDescription ?? ""),
      gameMatchVerdict: String(parsed.gameMatchVerdict ?? "Coincidencia revisada por IA."),
      gameMatchConfidence: clampScore(parsed.gameMatchConfidence),
      conditionIssues: issues,
      notes:
        "Estimación privada orientativa generada con visión IA sobre las fotos subidas. " +
        "No es una tasación oficial ni una garantía de venta.",
      analyzedAt: new Date().toISOString(),
      model: process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o-mini",
    };
  } catch {
    return null;
  }
}

/**
 * Análisis IA (MVP): heurística local + fotos subidas.
 * Sustituir por visión OpenAI/Claude cuando haya API key en producción.
 */
export async function analyzeListingPhotos(
  listing: MarketplaceListing,
  plan: UserPlan,
  userId: string,
): Promise<AiListingAnalysis | { error: string }> {
  if ((await aiQuotaRemaining(userId, plan)) <= 0) {
    return { error: "Has agotado los análisis IA de tu plan este mes." };
  }

  if (listing.photos.length < 4) {
    return { error: "Sube al menos las 4 fotos obligatorias antes del análisis." };
  }

  const game = getCatalogGame(listing.catalogId);
  const ref = game?.recommendedPrice ?? game?.pcRefPrice ?? listing.recordedSalePriceEur;
  const base = ref ?? 35;

  const vision = await analyzeWithOpenAiVision(listing, base);
  if (vision) {
    await incrementAiUsage(userId);
    return vision;
  }

  const photoScore = Math.min(1, listing.photos.length / 5);
  const sealedBoost = listing.sealed ? 1.15 : 1;
  const conditionScore = Math.round((0.72 + photoScore * 0.22) * 100) / 100;
  const conditionTen = Math.max(1, Math.min(10, Math.round(conditionScore * 10)));
  const estimated = Math.round(base * conditionScore * sealedBoost);

  let verdict = "Completo — buen estado general";
  if (conditionScore < 0.78) verdict = "Jugable — desgaste visible en carcasa o medio";
  if (conditionScore >= 0.9 && listing.sealed) verdict = "Precintado / como nuevo";

  const issues = listing.sealed
    ? ["Verificar que el precinto sea original y no tenga roturas visibles."]
    : [
        "Revisar bordes de caja y portada con las fotos reales.",
        "Comprobar arañazos del disco/cartucho antes de cerrar la compra.",
      ];

  await incrementAiUsage(userId);

  return {
    conditionVerdict: verdict,
    conditionScore,
    estimatedPriceEur: estimated,
    gameMatchVerdict:
      "Coincidencia probable con la ficha anunciada. En esta fase se valida que existan las fotos obligatorias; la visión avanzada queda preparada para producción.",
    gameMatchConfidence: 0.82,
    visualDescription:
      `Anuncio de ${listing.title} con ${listing.photos.length} foto${listing.photos.length === 1 ? "" : "s"} reales ` +
      `subidas por el vendedor. Estado orientativo ${conditionTen}/10 según completitud, precio de referencia y condición marcada.`,
    conditionIssues: issues,
    notes:
      "Estimación privada orientativa para negociar entre comprador y vendedor. " +
      "No es una tasación oficial. Preparado para sustituir esta heurística por visión real con API key.",
    analyzedAt: new Date().toISOString(),
    model: "pal-es-heuristic-v2",
  };
}
