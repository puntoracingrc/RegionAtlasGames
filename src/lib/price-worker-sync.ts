import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import { readBestPlatformSourcesDocument } from "./price-source-settings";

type SyncFile = {
  local: string;
  remote: string;
  optional?: boolean;
};

export type PriceWorkerSyncResult = {
  ok: true;
  remoteRoot: string;
  uploaded: SyncFile[];
  uploadedAt: string;
};

const BASE_WORKER_SYNC_FILES: SyncFile[] = [
  { local: "data/platform-sources.json", remote: "app/data/platform-sources.json" },
  { local: "data/ingest-recency.json", remote: "app/data/ingest-recency.json", optional: true },
  { local: "data/region-evidence-rules.json", remote: "app/data/region-evidence-rules.json" },
  { local: "data/price-source-weights.json", remote: "app/data/price-source-weights.json" },
  { local: "scripts/remote_price_rotation.sh", remote: "cron/price_rotation.sh" },
  { local: "scripts/remote_price_rotation.sh", remote: "../../../.region-atlas-cron/price_rotation.sh" },
  { local: "scripts/remote_price_job_runner.sh", remote: "cron/price_job_runner.sh" },
  { local: "scripts/remote_price_job_runner.sh", remote: "../../../.region-atlas-cron/price_job_runner.sh" },
];

function workerSyncFiles(): SyncFile[] {
  const files = [...BASE_WORKER_SYNC_FILES];
  const scriptsDir = path.join(process.cwd(), "scripts");
  for (const name of readdirSync(scriptsDir).filter((file) => file.endsWith(".py")).sort()) {
    files.push({ local: `scripts/${name}`, remote: `app/scripts/${name}` });
  }
  const collectorsDir = path.join(scriptsDir, "collectors");
  for (const name of readdirSync(collectorsDir).filter((file) => file.endsWith(".py")).sort()) {
    files.push({ local: `scripts/collectors/${name}`, remote: `app/scripts/collectors/${name}` });
  }
  return files;
}

function priceWorkerRemoteRoot(): string {
  const explicit = process.env.PRICE_WORKER_REMOTE_DIR?.trim();
  if (explicit) return explicit.replace(/^\/+|\/+$/g, "");
  const coversRoot = (process.env.COVERS_FTP_REMOTE_ROOT?.trim() || "MEDIAPUNTORACINGWEB/MEDIAREGIONATLAS/covers")
    .replace(/^\/+|\/+$/g, "");
  if (/\/covers$/i.test(coversRoot)) return coversRoot.replace(/\/covers$/i, "/price-worker");
  return `${coversRoot}/price-worker`;
}

function workerSftpConfig(): { host: string; port: number; username: string; password: string } | null {
  const host = process.env.PRICE_WORKER_SFTP_HOST?.trim() || process.env.COVERS_FTP_HOST?.trim() || process.env.PRICE_WORKER_SSH_HOST?.trim();
  const username = process.env.PRICE_WORKER_SFTP_USER?.trim() || process.env.COVERS_FTP_USER?.trim() || process.env.PRICE_WORKER_SSH_USER?.trim();
  const password = process.env.PRICE_WORKER_SFTP_PASSWORD?.trim() || process.env.COVERS_FTP_PASSWORD?.trim() || process.env.PRICE_WORKER_SSH_PASSWORD?.trim();
  if (!host || !username || !password) return null;
  const portRaw = process.env.PRICE_WORKER_SFTP_PORT?.trim() || process.env.COVERS_FTP_PORT?.trim() || process.env.PRICE_WORKER_SSH_PORT?.trim();
  const port = portRaw && Number.isFinite(Number(portRaw)) ? Number(portRaw) : 22;
  return { host, port, username, password };
}

export async function syncPriceWorkerCode(): Promise<PriceWorkerSyncResult | { error: string }> {
  const config = workerSftpConfig();
  if (!config) return { error: "FTP/SFTP del worker no configurado." };
  const protocol = process.env.COVERS_FTP_PROTOCOL?.trim().toLowerCase() || (config.port === 22 ? "sftp" : "ftp");
  if (protocol !== "sftp") return { error: "La sincronización del worker solo soporta SFTP." };

  const syncFiles = workerSyncFiles();
  for (const file of syncFiles) {
    const localPath = path.join(/* turbopackIgnore: true */ process.cwd(), file.local);
    if (!existsSync(/* turbopackIgnore: true */ localPath)) {
      if (file.optional) continue;
      return { error: `Falta archivo local: ${file.local}` };
    }
  }

  const mod = (await import("ssh2-sftp-client")) as unknown as {
    default: new () => {
      connect(config: Record<string, unknown>): Promise<void>;
      mkdir(remotePath: string, recursive?: boolean): Promise<void>;
      put(input: Buffer | string, remotePath: string): Promise<void>;
      chmod(remotePath: string, mode: number | string): Promise<void>;
      end(): Promise<void>;
    };
  };
  const client = new mod.default();
  const remoteRoot = priceWorkerRemoteRoot();
  const uploaded: SyncFile[] = [];
  const platformSourcesDocument = await readBestPlatformSourcesDocument();

  try {
    await client.connect({ ...config, readyTimeout: 60_000, retries: 1 });
    for (const file of syncFiles) {
      const localPath = path.join(/* turbopackIgnore: true */ process.cwd(), file.local);
      if (file.optional && !existsSync(/* turbopackIgnore: true */ localPath)) continue;
      const remotePath = path.posix.join(remoteRoot, file.remote);
      await client.mkdir(path.posix.dirname(remotePath), true);
      const payload =
        file.local === "data/platform-sources.json"
          ? Buffer.from(`${JSON.stringify(platformSourcesDocument, null, 2)}\n`, "utf8")
          : readFileSync(/* turbopackIgnore: true */ localPath);
      await client.put(payload, remotePath);
      if (file.remote.endsWith(".sh")) {
        await client.chmod(remotePath, 0o755).catch(() => undefined);
      }
      uploaded.push(file);
    }
  } finally {
    await client.end().catch(() => undefined);
  }

  return { ok: true, remoteRoot, uploaded, uploadedAt: new Date().toISOString() };
}
