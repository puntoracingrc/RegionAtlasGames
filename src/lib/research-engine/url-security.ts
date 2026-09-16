import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

export class ResearchUrlSecurityError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ResearchUrlSecurityError";
  }
}

function ipv4Parts(address: string): number[] | null {
  const parts = address.split(".").map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

export function isPrivateResearchAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  const version = isIP(normalized);
  if (version === 4) {
    const parts = ipv4Parts(normalized);
    if (!parts) return true;
    const [a, b] = parts;
    return a === 0
      || a === 10
      || a === 127
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 198 && (b === 18 || b === 19))
      || a >= 224;
  }
  if (version === 6) {
    return normalized === "::"
      || normalized === "::1"
      || normalized.startsWith("fc")
      || normalized.startsWith("fd")
      || /^fe[89ab]/.test(normalized)
      || normalized.startsWith("ff")
      || normalized.startsWith("2001:db8:")
      || normalized.startsWith("::ffff:127.")
      || normalized.startsWith("::ffff:10.")
      || normalized.startsWith("::ffff:192.168.");
  }
  return true;
}

const blockedHosts = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google.com",
  "instance-data.ec2.internal",
  "169.254.169.254",
]);

export type ResearchDnsLookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const defaultLookup: ResearchDnsLookup = async (hostname) => lookup(hostname, { all: true, verbatim: true });

export async function assertSafeResearchUrl(
  value: string,
  resolver: ResearchDnsLookup = defaultLookup,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ResearchUrlSecurityError("INVALID_URL", "Research URL is invalid.");
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ResearchUrlSecurityError("UNSUPPORTED_PROTOCOL", "Only HTTP and HTTPS research URLs are allowed.");
  }
  if (url.username || url.password) {
    throw new ResearchUrlSecurityError("URL_CREDENTIALS", "Research URLs cannot contain credentials.");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || blockedHosts.has(hostname) || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new ResearchUrlSecurityError("BLOCKED_HOST", "Local and metadata hosts are blocked.");
  }
  if (isIP(hostname)) {
    if (isPrivateResearchAddress(hostname)) throw new ResearchUrlSecurityError("PRIVATE_ADDRESS", "Private and special-use addresses are blocked.");
    return url;
  }
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await resolver(hostname);
  } catch {
    throw new ResearchUrlSecurityError("DNS_FAILED", `DNS lookup failed for ${hostname}.`);
  }
  if (!addresses.length || addresses.some((item) => isPrivateResearchAddress(item.address))) {
    throw new ResearchUrlSecurityError("PRIVATE_ADDRESS", "Resolved private and special-use addresses are blocked.");
  }
  return url;
}
