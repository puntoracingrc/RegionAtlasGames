import fs from "node:fs";
import path from "node:path";
import SftpClient from "ssh2-sftp-client";

const ROOT = process.cwd();
const NEWS_CACHE_FILE = path.join(ROOT, "data", "news-cache.json");

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadEnv() {
  loadEnvFile(path.join(ROOT, ".env.local"));
  loadEnvFile(path.join(ROOT, ".vercel", ".env.production.local"));
}

function remoteRoot() {
  const explicit = process.env.NEWS_FTP_REMOTE_ROOT?.trim();
  if (explicit) return explicit.replace(/^\/+|\/+$/g, "");
  const coversRoot = (process.env.COVERS_FTP_REMOTE_ROOT?.trim() || "MEDIAPUNTORACINGWEB/MEDIAREGIONATLAS/covers")
    .replace(/^\/+|\/+$/g, "");
  if (/\/covers$/i.test(coversRoot)) return coversRoot.replace(/\/covers$/i, "/news");
  return `${coversRoot}/news`;
}

function publicUrl() {
  const explicit = process.env.NEWS_CACHE_REMOTE_URL?.trim();
  if (explicit) return explicit;
  const coversBase = process.env.NEXT_PUBLIC_COVERS_BASE_URL?.trim() || "https://www.puntoracing.net/MEDIAREGIONATLAS/covers";
  return `${coversBase.replace(/\/covers\/?$/i, "/news").replace(/\/+$/g, "")}/news-cache.json`;
}

function config() {
  loadEnv();
  const host = process.env.COVERS_FTP_HOST?.trim();
  const user = process.env.COVERS_FTP_USER?.trim();
  const password = process.env.COVERS_FTP_PASSWORD?.trim();
  const portRaw = process.env.COVERS_FTP_PORT?.trim();
  const port = portRaw && Number.isFinite(Number(portRaw)) ? Number(portRaw) : 22;
  const protocol = process.env.COVERS_FTP_PROTOCOL?.trim().toLowerCase() || (port === 22 ? "sftp" : "ftp");
  if (!host || !user || !password) {
    throw new Error("Faltan credenciales COVERS_FTP_* para subir news-cache.json.");
  }
  if (protocol !== "sftp") {
    throw new Error("El uploader de noticias usa SFTP. Si necesitas FTP/FTPS, lo añadimos como fallback.");
  }
  return { host, user, password, port, remoteRoot: remoteRoot() };
}

async function upload() {
  if (!fs.existsSync(NEWS_CACHE_FILE)) {
    throw new Error(`No existe ${NEWS_CACHE_FILE}`);
  }
  JSON.parse(fs.readFileSync(NEWS_CACHE_FILE, "utf8"));

  const cfg = config();
  const client = new SftpClient();
  const remotePath = path.posix.join(cfg.remoteRoot, "news-cache.json");
  try {
    await client.connect({
      host: cfg.host,
      port: cfg.port,
      username: cfg.user,
      password: cfg.password,
      readyTimeout: 60_000,
      retries: 1,
    });
    await client.mkdir(cfg.remoteRoot, true);
    await client.put(NEWS_CACHE_FILE, remotePath);
  } finally {
    await client.end().catch(() => undefined);
  }
  console.log(`Subido: ${remotePath}`);
  console.log(`URL pública esperada: ${publicUrl()}`);
}

upload().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
