import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { getCatalogGame } from "./catalog";
import type { AiListingAnalysis, MarketplaceListing } from "./marketplace-types";
import { aiQuotaForPlan } from "./plans";
import type { UserPlan } from "./marketplace-types";

const USAGE_FILE = path.join(process.cwd(), "data", "marketplace", "ai-usage.json");

type UsageRow = { userId: string; month: string; count: number };

function monthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function readUsage(): UsageRow[] {
  try {
    return JSON.parse(readFileSync(USAGE_FILE, "utf-8")) as UsageRow[];
  } catch {
    return [];
  }
}

function writeUsage(rows: UsageRow[]) {
  const dir = path.dirname(USAGE_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(USAGE_FILE, JSON.stringify(rows, null, 2), "utf-8");
}

export function getAiUsageCount(userId: string): number {
  const key = monthKey();
  return readUsage().find((r) => r.userId === userId && r.month === key)?.count ?? 0;
}

export function incrementAiUsage(userId: string): number {
  const key = monthKey();
  const rows = readUsage();
  const idx = rows.findIndex((r) => r.userId === userId && r.month === key);
  if (idx === -1) {
    rows.push({ userId, month: key, count: 1 });
  } else {
    rows[idx].count += 1;
  }
  writeUsage(rows);
  return rows.find((r) => r.userId === userId && r.month === key)!.count;
}

export function aiQuotaRemaining(userId: string, plan: UserPlan): number {
  return Math.max(0, aiQuotaForPlan(plan) - getAiUsageCount(userId));
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
  if (aiQuotaRemaining(userId, plan) <= 0) {
    return { error: "Has agotado los análisis IA de tu plan este mes." };
  }

  if (listing.photos.length < 4) {
    return { error: "Sube al menos las 4 fotos obligatorias antes del análisis." };
  }

  const game = getCatalogGame(listing.catalogId);
  const ref = game?.recommendedPrice ?? game?.pcRefPrice ?? listing.recordedSalePriceEur;
  const base = ref ?? 35;

  const photoScore = Math.min(1, listing.photos.length / 5);
  const sealedBoost = listing.sealed ? 1.15 : 1;
  const conditionScore = Math.round((0.72 + photoScore * 0.22) * 100) / 100;
  const estimated = Math.round(base * conditionScore * sealedBoost);

  let verdict = "Completo — buen estado general";
  if (conditionScore < 0.78) verdict = "Jugable — desgaste visible en carcasa o medio";
  if (conditionScore >= 0.9 && listing.sealed) verdict = "Precintado / como nuevo";

  incrementAiUsage(userId);

  return {
    conditionVerdict: verdict,
    conditionScore,
    estimatedPriceEur: estimated,
    notes:
      "Estimación privada orientativa para negociar entre comprador y vendedor. " +
      "No es una tasación oficial. IA revisará fotos reales en producción.",
    analyzedAt: new Date().toISOString(),
    model: "pal-es-heuristic-v1",
  };
}
