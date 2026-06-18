import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { canWriteCatalogFiles } from "./admin-auth";
import type { NewsItem, NewsSection } from "./types";

const NEWS_SETTINGS_FILE = path.join(process.cwd(), "data", "news-settings.json");
const NEWS_SETTINGS_REMOTE_REVALIDATE_SECONDS = 5 * 60;

export type NewsSettings = {
  updatedAt?: string;
  sections: {
    home: boolean;
    companies: boolean;
  };
  platformTopics: {
    playstation: boolean;
    nintendo: boolean;
    snk: boolean;
  };
  blockedDomains: string[];
  blockedSources: string[];
  blockedTerms: string[];
};

const DEFAULT_NEWS_SETTINGS: NewsSettings = {
  sections: {
    home: true,
    companies: true,
  },
  platformTopics: {
    playstation: true,
    nintendo: true,
    snk: true,
  },
  blockedDomains: [],
  blockedSources: [],
  blockedTerms: [],
};

function uniqueList(values: unknown, lower = false): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/g, "");
    if (!normalized) continue;
    const finalValue = lower ? normalized.toLowerCase() : normalized;
    const key = finalValue.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(finalValue);
  }
  return next;
}

export function normalizeNewsSettings(input: unknown): NewsSettings {
  const raw = input && typeof input === "object" ? (input as Partial<NewsSettings>) : {};
  return {
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    sections: {
      home: raw.sections?.home !== false,
      companies: raw.sections?.companies !== false,
    },
    platformTopics: {
      playstation: raw.platformTopics?.playstation !== false,
      nintendo: raw.platformTopics?.nintendo !== false,
      snk: raw.platformTopics?.snk !== false,
    },
    blockedDomains: uniqueList(raw.blockedDomains, true),
    blockedSources: uniqueList(raw.blockedSources),
    blockedTerms: uniqueList(raw.blockedTerms),
  };
}

function remoteNewsSettingsUrl(): string | null {
  const explicit = process.env.NEWS_SETTINGS_REMOTE_URL?.trim();
  if (explicit) return explicit;

  const cacheUrl = process.env.NEWS_CACHE_REMOTE_URL?.trim();
  if (cacheUrl) return cacheUrl.replace(/\/news-cache\.json(?:\?.*)?$/i, "/news-settings.json");

  const coversBase = process.env.NEXT_PUBLIC_COVERS_BASE_URL?.trim();
  if (!coversBase) return null;
  const newsBase = coversBase.replace(/\/covers\/?$/i, "/news").replace(/\/+$/g, "");
  return `${newsBase}/news-settings.json`;
}

function newsFtpConfigured(): boolean {
  return Boolean(
    process.env.COVERS_FTP_HOST?.trim() &&
      process.env.COVERS_FTP_USER?.trim() &&
      process.env.COVERS_FTP_PASSWORD?.trim(),
  );
}

function newsRemoteRoot(): string {
  const explicit = process.env.NEWS_FTP_REMOTE_ROOT?.trim();
  if (explicit) return explicit.replace(/^\/+|\/+$/g, "");
  const coversRoot = (process.env.COVERS_FTP_REMOTE_ROOT?.trim() || "MEDIAPUNTORACINGWEB/MEDIAREGIONATLAS/covers")
    .replace(/^\/+|\/+$/g, "");
  if (/\/covers$/i.test(coversRoot)) return coversRoot.replace(/\/covers$/i, "/news");
  return `${coversRoot}/news`;
}

async function uploadNewsSettingsToSftp(settings: NewsSettings): Promise<void> {
  if (!newsFtpConfigured()) return;
  const portRaw = process.env.COVERS_FTP_PORT?.trim();
  const port = portRaw && Number.isFinite(Number(portRaw)) ? Number(portRaw) : 22;
  const protocol = process.env.COVERS_FTP_PROTOCOL?.trim().toLowerCase() || (port === 22 ? "sftp" : "ftp");
  if (protocol !== "sftp") {
    throw new Error("La subida remota de ajustes de noticias solo soporta SFTP por ahora.");
  }

  const mod = (await import("ssh2-sftp-client")) as unknown as { default: new () => {
    connect(config: Record<string, unknown>): Promise<void>;
    mkdir(remotePath: string, recursive?: boolean): Promise<void>;
    put(input: Buffer | string, remotePath: string): Promise<void>;
    end(): Promise<void>;
  } };
  const client = new mod.default();
  const remoteRoot = newsRemoteRoot();
  const remotePath = path.posix.join(remoteRoot, "news-settings.json");
  try {
    await client.connect({
      host: process.env.COVERS_FTP_HOST?.trim(),
      port,
      username: process.env.COVERS_FTP_USER?.trim(),
      password: process.env.COVERS_FTP_PASSWORD?.trim(),
      readyTimeout: 60_000,
      retries: 1,
    });
    await client.mkdir(remoteRoot, true);
    await client.put(Buffer.from(`${JSON.stringify(settings, null, 2)}\n`, "utf8"), remotePath);
  } finally {
    await client.end().catch(() => undefined);
  }
}

function readNewsSettingsFromDisk(): NewsSettings {
  try {
    return normalizeNewsSettings(JSON.parse(readFileSync(NEWS_SETTINGS_FILE, "utf8")));
  } catch {
    return normalizeNewsSettings(DEFAULT_NEWS_SETTINGS);
  }
}

async function readNewsSettingsFromRemote(): Promise<NewsSettings | null> {
  const url = remoteNewsSettingsUrl();
  if (!url) return null;
  try {
    const response = await fetch(url, {
      next: { revalidate: NEWS_SETTINGS_REMOTE_REVALIDATE_SECONDS },
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    return normalizeNewsSettings(await response.json());
  } catch {
    return null;
  }
}

export async function readNewsSettings(): Promise<NewsSettings> {
  return (await readNewsSettingsFromRemote()) ?? readNewsSettingsFromDisk();
}

export async function writeNewsSettings(input: unknown): Promise<NewsSettings> {
  const settings = normalizeNewsSettings({
    ...(input && typeof input === "object" ? input : {}),
    updatedAt: new Date().toISOString(),
  });
  if (canWriteCatalogFiles() || !process.env.VERCEL) {
    const dir = path.dirname(NEWS_SETTINGS_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(NEWS_SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  }
  await uploadNewsSettingsToSftp(settings);
  return settings;
}

export function newsSectionEnabled(settings: NewsSettings, section: NewsSection, topic?: string): boolean {
  if (section === "home") return settings.sections.home;
  if (section === "company") return settings.sections.companies;
  if (section === "platform") {
    if (topic === "playstation") return settings.platformTopics.playstation;
    if (topic === "nintendo") return settings.platformTopics.nintendo;
    if (topic === "snk") return settings.platformTopics.snk;
  }
  return true;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function domainFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return "";
  }
}

export function newsItemAllowedBySettings(settings: NewsSettings, item: Pick<NewsItem, "url" | "sourceName" | "title" | "snippet">): boolean {
  const domain = domainFromUrl(item.url);
  if (domain && settings.blockedDomains.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`))) {
    return false;
  }

  const source = normalizeText(item.sourceName);
  if (settings.blockedSources.some((blocked) => source.includes(normalizeText(blocked)))) {
    return false;
  }

  const haystack = normalizeText(`${item.title} ${item.snippet ?? ""} ${item.sourceName}`);
  return !settings.blockedTerms.some((term) => haystack.includes(normalizeText(term)));
}
