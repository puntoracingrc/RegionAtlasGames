import { createHash, timingSafeEqual } from "node:crypto";

export class CatalogConnectorError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type CatalogEvidence = {
  label: string;
  url: string;
};

export type CatalogSubmission = {
  schemaVersion: 1;
  batchId: string;
  taskId: string;
  title: string;
  platformSlug: string;
  region: string;
  physicalVariant: string | null;
  sources: CatalogEvidence[];
};

function fail(message: string): never {
  throw new CatalogConnectorError(400, message);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Objeto JSON no válido.");
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key))) fail("El documento contiene campos no admitidos.");
}

function text(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) {
    fail(`${name} no válido.`);
  }
  return value.trim();
}

export function parseCatalogSubmission(raw: unknown): CatalogSubmission {
  const body = object(raw);
  exactKeys(body, ["schemaVersion", "batchId", "taskId", "title", "platformSlug", "region", "physicalVariant", "sources"]);
  if (body.schemaVersion !== 1) fail("Se requiere schemaVersion 1.");

  const batchId = text(body.batchId, "batchId", 120);
  if (!/^[a-zA-Z0-9_-]+$/.test(batchId)) fail("batchId no válido.");
  const platformSlug = text(body.platformSlug, "platformSlug", 50);
  if (!/^[a-z0-9-]+$/.test(platformSlug)) fail("platformSlug no válido.");
  const region = text(body.region, "region", 100);
  if (region !== "PAL España") fail("Este conector solo admite PAL España en esta fase.");

  let physicalVariant: string | null = null;
  if (body.physicalVariant != null) physicalVariant = text(body.physicalVariant, "physicalVariant", 200);
  if (!Array.isArray(body.sources) || body.sources.length < 1 || body.sources.length > 20) {
    fail("Se requiere entre 1 y 20 fuentes de evidencia.");
  }
  const seenUrls = new Set<string>();
  const sources = body.sources.map((rawSource) => {
    const source = object(rawSource);
    exactKeys(source, ["label", "url"]);
    const url = text(source.url, "source.url", 2048);
    let parsed: URL;
    try { parsed = new URL(url); } catch { return fail("URL de evidencia no válida."); }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      fail("La evidencia debe tener una URL HTTPS sin credenciales.");
    }
    if (seenUrls.has(url)) fail("La misma fuente está repetida.");
    seenUrls.add(url);
    return { label: text(source.label, "source.label", 200), url };
  }).sort((a, b) => a.url.localeCompare(b.url, "en"));

  return {
    schemaVersion: 1,
    batchId,
    taskId: text(body.taskId, "taskId", 160),
    title: text(body.title, "title", 500),
    platformSlug,
    region,
    physicalVariant,
    sources,
  };
}

export function catalogSubmissionDigest(input: CatalogSubmission): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function authorizeCatalogConnector(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): void {
  if (env.CATALOG_CONNECTOR_ENABLED !== "1" || !/^[a-f0-9]{64}$/.test(env.PRICE_CONNECTOR_TOKEN_SHA256 ?? "")) {
    throw new CatalogConnectorError(503, "Conector no configurado.");
  }
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const expected = env.PRICE_CONNECTOR_TOKEN_SHA256!;
  if (
    token.length < 32 ||
    token.length > 512 ||
    !timingSafeEqual(createHash("sha256").update(token).digest(), Buffer.from(expected, "hex"))
  ) {
    throw new CatalogConnectorError(401, "No autorizado.");
  }
}
