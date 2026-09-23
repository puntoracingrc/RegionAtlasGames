import { createHash } from "node:crypto";
import { isTrustedMutationOrigin } from "@/lib/request-origin";
import {
  checkRequestRateLimit,
  rateLimitHeaders,
  readJsonBody,
  requestClientAddress,
} from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech";
const voices = new Set(["marin", "cedar", "coral"]);
const modes = new Set(["broadcast", "pilot"]);
const responseHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

type SpeechRequest = {
  text?: unknown;
  voice?: unknown;
  mode?: unknown;
};

function configured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function cleanSpeechText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

function speechInstructions(mode: string): string {
  if (mode === "pilot") {
    return "Habla en español de España como un ingeniero de pista por radio: muy claro, directo, sereno y breve. Pronuncia posiciones, vueltas, segundos y nombres con precisión. No añadas información que no figure en el texto.";
  }
  return "Habla en español de España como comentarista profesional de automovilismo: voz clara, natural y fluida, con energía contenida. Da prioridad a nombres, posiciones, vueltas y diferencias. No añadas información que no figure en el texto.";
}

export async function GET() {
  return Response.json(
    { available: configured(), model: "gpt-4o-mini-tts", voices: [...voices] },
    { headers: responseHeaders },
  );
}

export async function POST(request: Request) {
  if (!isTrustedMutationOrigin(request)) {
    return Response.json({ error: "Origen no permitido." }, { status: 403, headers: responseHeaders });
  }
  if (!configured()) {
    return Response.json({ error: "La narración por voz todavía no está configurada." }, { status: 503, headers: responseHeaders });
  }

  const body = await readJsonBody<SpeechRequest>(request, 2_048);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status, headers: responseHeaders });

  const text = cleanSpeechText(body.data.text);
  const voice = typeof body.data.voice === "string" && voices.has(body.data.voice) ? body.data.voice : "marin";
  const mode = typeof body.data.mode === "string" && modes.has(body.data.mode) ? body.data.mode : "broadcast";
  if (!text || text.length > 600) {
    return Response.json({ error: "El aviso debe contener entre 1 y 600 caracteres." }, { status: 400, headers: responseHeaders });
  }

  const minuteRate = await checkRequestRateLimit(request, {
    namespace: "rctimes-speech-minute",
    limit: 30,
    windowMs: 60_000,
  });
  if (!minuteRate.allowed) {
    return Response.json({ error: "Demasiados avisos de voz seguidos." }, { status: 429, headers: rateLimitHeaders(minuteRate) });
  }
  const hourRate = await checkRequestRateLimit(request, {
    namespace: "rctimes-speech-hour",
    limit: 300,
    windowMs: 3_600_000,
  });
  if (!hourRate.allowed) {
    return Response.json({ error: "Se ha alcanzado el límite de narración de esta hora." }, { status: 429, headers: rateLimitHeaders(hourRate) });
  }

  const safetyIdentifier = createHash("sha256")
    .update(`rctimes:${requestClientAddress(request)}`)
    .digest("hex")
    .slice(0, 32);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const upstream = await fetch(OPENAI_SPEECH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY!.trim()}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": safetyIdentifier,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice,
        input: text,
        instructions: speechInstructions(mode),
        response_format: "mp3",
      }),
      signal: controller.signal,
    });
    if (!upstream.ok || !upstream.body) {
      console.error("[rctimes/speech] OpenAI rejected speech generation", upstream.status);
      return Response.json({ error: "No se pudo generar este aviso de voz." }, { status: 502, headers: responseHeaders });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...responseHeaders,
        "Content-Type": upstream.headers.get("content-type") || "audio/mpeg",
        "X-RateLimit-Remaining": String(Math.min(minuteRate.remaining, hourRate.remaining)),
      },
    });
  } catch (error) {
    console.error("[rctimes/speech] speech generation failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "La voz no está disponible en este momento." }, { status: 503, headers: responseHeaders });
  } finally {
    clearTimeout(timeout);
  }
}
