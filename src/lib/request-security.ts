import { createHmac } from "crypto";
import { get, put } from "@vercel/blob";
import { ipAddress } from "@vercel/functions";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";
import { getSessionSecret } from "./server-env";

type RateLimitCounter = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
};

type RateLimitOptions = {
  namespace: string;
  identifier: string;
  limit: number;
  windowMs: number;
  now?: number;
  backend?: "auto" | "memory";
};

const memoryCounters = new Map<string, RateLimitCounter>();

function cleanNamespace(namespace: string): string {
  return namespace.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 48) || "general";
}

function windowStart(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

function resultFor(count: number, limit: number, resetAt: number, now: number): RateLimitResult {
  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    resetAt,
  };
}

function rateLimitPath(namespace: string, identifier: string, start: number): string {
  const digest = createHmac("sha256", getSessionSecret())
    .update(`${namespace}:${identifier}`)
    .digest("hex");
  return `region-atlas/security/rate-limits/v1/${namespace}/${start}-${digest}.json`;
}

function consumeMemoryCounter(options: RateLimitOptions): RateLimitResult {
  const now = options.now ?? Date.now();
  const start = windowStart(now, options.windowMs);
  const resetAt = start + options.windowMs;
  const key = `${cleanNamespace(options.namespace)}:${start}:${options.identifier}`;
  const previous = memoryCounters.get(key);
  const count = (previous?.resetAt === resetAt ? previous.count : 0) + 1;
  memoryCounters.set(key, { count, resetAt });

  if (memoryCounters.size > 2_000) {
    for (const [storedKey, counter] of memoryCounters) {
      if (counter.resetAt <= now) memoryCounters.delete(storedKey);
    }
  }

  return resultFor(count, options.limit, resetAt, now);
}

async function consumeBlobCounter(options: RateLimitOptions): Promise<RateLimitResult> {
  const now = options.now ?? Date.now();
  const namespace = cleanNamespace(options.namespace);
  const start = windowStart(now, options.windowMs);
  const resetAt = start + options.windowMs;
  const pathname = rateLimitPath(namespace, options.identifier, start);
  const auth = await blobAuthOptions("private");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const existing = await get(pathname, { ...auth, useCache: false });
    let count = 0;
    let etag: string | null = null;

    if (existing?.statusCode === 200 && existing.stream) {
      etag = existing.blob.etag;
      try {
        const parsed = JSON.parse(await new Response(existing.stream).text()) as Partial<RateLimitCounter>;
        count = Number.isFinite(parsed.count) ? Math.max(0, Number(parsed.count)) : 0;
      } catch {
        count = 0;
      }
    }

    if (count >= options.limit) {
      return resultFor(count + 1, options.limit, resetAt, now);
    }

    const nextCount = count + 1;
    try {
      await put(pathname, JSON.stringify({ count: nextCount, resetAt }), {
        ...auth,
        contentType: "application/json",
        addRandomSuffix: false,
        cacheControlMaxAge: 60,
        maximumSizeInBytes: 1_024,
        ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
      });
      return resultFor(nextCount, options.limit, resetAt, now);
    } catch {
      // Another instance updated the same counter; re-read and retry.
    }
  }

  throw new Error("No se pudo actualizar el contador distribuido.");
}

export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const useBlob =
    options.backend !== "memory" && process.env.VERCEL === "1" && blobAuthConfigured();
  if (!useBlob) return consumeMemoryCounter(options);

  try {
    return await consumeBlobCounter(options);
  } catch (error) {
    console.error("[security/rate-limit] distributed counter failed", error);
    return consumeMemoryCounter(options);
  }
}

export function requestClientAddress(request: Request): string {
  const vercelIp = ipAddress(request);
  if (vercelIp) return vercelIp;
  if (!process.env.VERCEL) {
    return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  }
  return "unknown";
}

export async function checkRequestRateLimit(
  request: Request,
  options: Omit<RateLimitOptions, "identifier"> & { identity?: string },
): Promise<RateLimitResult> {
  const identity = options.identity?.trim().toLowerCase();
  return checkRateLimit({
    ...options,
    identifier: identity
      ? `${requestClientAddress(request)}:${identity}`
      : requestClientAddress(request),
  });
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "Cache-Control": "no-store",
    "Retry-After": String(result.retryAfterSeconds),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
}

export async function readJsonBody<T extends Record<string, unknown>>(
  request: Request,
  maxBytes = 16 * 1024,
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    return { ok: false, error: "Content-Type debe ser application/json.", status: 415 };
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false, error: "La solicitud es demasiado grande.", status: 413 };
  }

  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    return { ok: false, error: "La solicitud es demasiado grande.", status: 413 };
  }

  try {
    const data = JSON.parse(text) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { ok: false, error: "JSON no válido.", status: 400 };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "JSON no válido.", status: 400 };
  }
}

export function resetMemoryRateLimitsForTests(): void {
  memoryCounters.clear();
}
