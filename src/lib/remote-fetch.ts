import { lookup } from "dns/promises";
import { isIP } from "net";

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

export function isPrivateOrReservedIp(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  const version = isIP(normalized);
  if (version === 4) return isPrivateIpv4(normalized);
  if (version !== 6) return true;

  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4);

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:")
  );
}

export async function assertSafeRemoteUrl(value: string | URL): Promise<URL> {
  const url = value instanceof URL ? new URL(value) : new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error("Solo se permiten URLs HTTP o HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("La URL no puede incluir credenciales.");
  }
  if (url.port && !["80", "443"].includes(url.port)) {
    throw new Error("El puerto remoto no está permitido.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("El destino remoto no está permitido.");
  }

  if (isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) throw new Error("El destino remoto no está permitido.");
    return url;
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateOrReservedIp(address))) {
    throw new Error("El destino remoto no está permitido.");
  }
  return url;
}

export async function safeRemoteFetch(
  value: string | URL,
  init: RequestInit = {},
  maxRedirects = 4,
): Promise<Response> {
  let current = await assertSafeRemoteUrl(value);

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const response = await fetch(current, { ...init, redirect: "manual" });
    if (!REDIRECT_STATUS.has(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) throw new Error("Redirección remota sin destino.");
    if (redirects === maxRedirects) throw new Error("Demasiadas redirecciones remotas.");
    current = await assertSafeRemoteUrl(new URL(location, current));
  }

  throw new Error("No se pudo descargar el recurso remoto.");
}
