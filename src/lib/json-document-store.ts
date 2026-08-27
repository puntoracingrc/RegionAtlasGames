import { randomUUID } from "crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "fs/promises";
import path from "path";
import {
  BlobPreconditionFailedError,
  get,
  put,
} from "@vercel/blob";
import { blobAuthOptions } from "./blob-auth";

export type JsonMutation<T, R> = (
  current: T,
) => Promise<{ next: T; result: R; changed?: boolean }> | { next: T; result: R; changed?: boolean };

type BlobDocumentOptions<T> = {
  pathname: string;
  empty: () => T;
  parse: (raw: string) => T;
  maximumSizeInBytes?: number;
  cacheControlMaxAge?: number;
};

type DiskDocumentOptions<T> = {
  pathname: string;
  readCandidates?: string[];
  empty: () => T;
  parse: (raw: string) => T;
};

type VersionedBlobDocument<T> = {
  value: T;
  etag: string | null;
  exists: boolean;
};

const diskQueues = new Map<string, Promise<void>>();

function isConflict(error: unknown): boolean {
  return (
    error instanceof BlobPreconditionFailedError ||
    (error instanceof Error && error.name === "BlobPreconditionFailedError")
  );
}

async function readVersionedBlobDocument<T>(
  options: BlobDocumentOptions<T>,
): Promise<VersionedBlobDocument<T>> {
  const auth = await blobAuthOptions("private");
  const response = await get(options.pathname, { ...auth, useCache: false });
  if (!response) {
    return { value: options.empty(), etag: null, exists: false };
  }
  if (response.statusCode !== 200 || !response.stream) {
    throw new Error(`No se pudo leer ${options.pathname} (HTTP ${response.statusCode}).`);
  }
  return {
    value: options.parse(await new Response(response.stream).text()),
    etag: response.blob.etag,
    exists: true,
  };
}

export async function readBlobJsonDocument<T>(options: BlobDocumentOptions<T>): Promise<T> {
  return (await readVersionedBlobDocument(options)).value;
}

export async function mutateBlobJsonDocument<T, R>(
  options: BlobDocumentOptions<T>,
  mutation: JsonMutation<T, R>,
  maxAttempts = 8,
): Promise<R> {
  const auth = await blobAuthOptions("private");

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const current = await readVersionedBlobDocument(options);
    const outcome = await mutation(current.value);
    if (outcome.changed === false) return outcome.result;

    try {
      await put(options.pathname, `${JSON.stringify(outcome.next, null, 2)}\n`, {
        ...auth,
        contentType: "application/json",
        addRandomSuffix: false,
        cacheControlMaxAge: options.cacheControlMaxAge ?? 30,
        maximumSizeInBytes: options.maximumSizeInBytes,
        ...(current.exists && current.etag
          ? { ifMatch: current.etag }
          : { allowOverwrite: false }),
      });
      return outcome.result;
    } catch (error) {
      if (isConflict(error)) continue;
      throw error;
    }
  }

  throw new Error("El documento cambió demasiadas veces a la vez. Vuelve a intentarlo.");
}

async function withDiskQueue<R>(key: string, operation: () => Promise<R>): Promise<R> {
  const previous = diskQueues.get(key) ?? Promise.resolve();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => gate);
  diskQueues.set(key, queued);

  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (diskQueues.get(key) === queued) diskQueues.delete(key);
  }
}

export async function readDiskJsonDocument<T>(options: DiskDocumentOptions<T>): Promise<T> {
  const candidates = Array.from(
    new Set([options.pathname, ...(options.readCandidates ?? [])]),
  );
  for (const candidate of candidates) {
    try {
      return options.parse(await readFile(candidate, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
  }
  return options.empty();
}

export async function writeDiskJsonDocument<T>(pathname: string, value: T): Promise<void> {
  await mkdir(path.dirname(pathname), { recursive: true });
  const temporary = `${pathname}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporary, pathname);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export async function mutateDiskJsonDocument<T, R>(
  options: DiskDocumentOptions<T>,
  mutation: JsonMutation<T, R>,
): Promise<R> {
  return withDiskQueue(options.pathname, async () => {
    const current = await readDiskJsonDocument(options);
    const outcome = await mutation(current);
    if (outcome.changed !== false) {
      await writeDiskJsonDocument(options.pathname, outcome.next);
    }
    return outcome.result;
  });
}
