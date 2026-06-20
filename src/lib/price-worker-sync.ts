import { existsSync, readFileSync } from "fs";
import path from "path";

type SyncFile = {
  local: string;
  remote: string;
};

export type PriceWorkerSyncResult = {
  ok: true;
  remoteRoot: string;
  uploaded: SyncFile[];
  uploadedAt: string;
};

const WORKER_SYNC_FILES: SyncFile[] = [
  { local: "data/platform-sources.json", remote: "app/data/platform-sources.json" },
  { local: "scripts/admin_price_collect.py", remote: "app/scripts/admin_price_collect.py" },
  { local: "scripts/daily_price_ingest.py", remote: "app/scripts/daily_price_ingest.py" },
  { local: "scripts/sync_es_prices.py", remote: "app/scripts/sync_es_prices.py" },
  { local: "scripts/collect_todocoleccion.py", remote: "app/scripts/collect_todocoleccion.py" },
  { local: "scripts/collectors/platform_sources.py", remote: "app/scripts/collectors/platform_sources.py" },
  { local: "scripts/collectors/tc_client.py", remote: "app/scripts/collectors/tc_client.py" },
];

function priceWorkerRemoteRoot(): string {
  const explicit = process.env.PRICE_WORKER_REMOTE_DIR?.trim();
  if (explicit) return explicit.replace(/^\/+|\/+$/g, "");
  const coversRoot = (process.env.COVERS_FTP_REMOTE_ROOT?.trim() || "MEDIAPUNTORACINGWEB/MEDIAREGIONATLAS/covers")
    .replace(/^\/+|\/+$/g, "");
  if (/\/covers$/i.test(coversRoot)) return coversRoot.replace(/\/covers$/i, "/price-worker");
  return `${coversRoot}/price-worker`;
}

function workerSftpConfig(): { host: string; port: number; username: string; password: string } | null {
  const host = process.env.PRICE_WORKER_SSH_HOST?.trim() || process.env.COVERS_FTP_HOST?.trim();
  const username = process.env.PRICE_WORKER_SSH_USER?.trim() || process.env.COVERS_FTP_USER?.trim();
  const password = process.env.PRICE_WORKER_SSH_PASSWORD?.trim() || process.env.COVERS_FTP_PASSWORD?.trim();
  if (!host || !username || !password) return null;
  const portRaw = process.env.PRICE_WORKER_SSH_PORT?.trim() || process.env.COVERS_FTP_PORT?.trim();
  const port = portRaw && Number.isFinite(Number(portRaw)) ? Number(portRaw) : 22;
  return { host, port, username, password };
}

export async function syncPriceWorkerCode(): Promise<PriceWorkerSyncResult | { error: string }> {
  const config = workerSftpConfig();
  if (!config) return { error: "FTP/SFTP del worker no configurado." };
  const protocol = process.env.COVERS_FTP_PROTOCOL?.trim().toLowerCase() || (config.port === 22 ? "sftp" : "ftp");
  if (protocol !== "sftp") return { error: "La sincronización del worker solo soporta SFTP." };

  for (const file of WORKER_SYNC_FILES) {
    if (!existsSync(path.join(process.cwd(), file.local))) {
      return { error: `Falta archivo local: ${file.local}` };
    }
  }

  const mod = (await import("ssh2-sftp-client")) as unknown as {
    default: new () => {
      connect(config: Record<string, unknown>): Promise<void>;
      mkdir(remotePath: string, recursive?: boolean): Promise<void>;
      put(input: Buffer | string, remotePath: string): Promise<void>;
      end(): Promise<void>;
    };
  };
  const client = new mod.default();
  const remoteRoot = priceWorkerRemoteRoot();
  const uploaded: SyncFile[] = [];

  try {
    await client.connect({ ...config, readyTimeout: 60_000, retries: 1 });
    for (const file of WORKER_SYNC_FILES) {
      const remotePath = path.posix.join(remoteRoot, file.remote);
      await client.mkdir(path.posix.dirname(remotePath), true);
      await client.put(readFileSync(path.join(process.cwd(), file.local)), remotePath);
      uploaded.push(file);
    }
  } finally {
    await client.end().catch(() => undefined);
  }

  return { ok: true, remoteRoot, uploaded, uploadedAt: new Date().toISOString() };
}
