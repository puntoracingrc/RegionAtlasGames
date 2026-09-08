import { NextResponse } from "next/server";
import platformData from "../../../../data/platforms.json";
import { getCurrentUser } from "@/lib/users";
import { isTrustedMutationOrigin } from "@/lib/request-origin";
import { marketplaceRateLimitResponse } from "@/lib/marketplace-request-security";
import { aiQuotaRemaining, consumeAiQuota } from "@/lib/ai-quota";
import { readScannerUpload } from "@/lib/scanner-upload";
import { scanGamePhotos, ScannerError } from "@/lib/scanner-engine";
import { isAdminEmail } from "@/lib/admin-auth";
import { SCANNER_DEFAULT_MODEL, scannerModelsForAccess } from "@/lib/scanner-models";

export const runtime = "nodejs";
export const maxDuration = 240;
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const platforms = platformData.filter((p) => !("active" in p) || p.active !== false).map((p) => p.slug);
const available = () => Boolean(process.env.OPENAI_API_KEY?.trim()) && process.env.PRICE_AI_DISABLED !== "1" && process.env.REGION_VISION_DISABLED !== "1";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ authenticated: Boolean(user), available: available(),
      models: scannerModelsForAccess(isAdminEmail(user?.email)).map((model) => model.id), defaultModel: SCANNER_DEFAULT_MODEL,
      remaining: user ? await aiQuotaRemaining(user.id, user.plan) : null }, { headers });
  } catch {
    return NextResponse.json({ error: "No se pudo consultar la disponibilidad del escáner." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  if (!isTrustedMutationOrigin(request)) return NextResponse.json({ error: "Origen no permitido." }, { status: 403, headers });
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Inicia sesión para escanear." }, { status: 401, headers });
    if (!available()) throw new ScannerError("unavailable", "El reconocimiento está pausado o no está disponible. No se hará un análisis sin IA.");
    const limited = await marketplaceRateLimitResponse(request, { action: "scanner", userId: user.id, limit: 10, windowMs: 3600_000 });
    if (limited) return limited;
    const upload = await readScannerUpload(request, platforms, isAdminEmail(user.email));
    const quota = await consumeAiQuota(user.id, user.plan);
    if (!quota.allowed) throw new ScannerError("quota_exhausted", "Has agotado los análisis de este mes, compartidos con Vitrina.", 429);
    const result = await scanGamePhotos({ ...upload, userId: user.id, allowedPlatforms: platforms });
    return NextResponse.json({ result, remaining: quota.remaining }, { headers });
  } catch (error) {
    if (error instanceof ScannerError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers });
    return NextResponse.json({ error: "No se pudo completar el escaneo. Inténtalo de nuevo más tarde." }, { status: 503, headers });
  }
}
