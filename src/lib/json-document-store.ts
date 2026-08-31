import { randomUUID } from "crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "fs/promises";
import path from "path";
import {
  BlobNotFoundError,
  BlobPreconditionFailedError,
  get,
  head,
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

type BlobDocumentDependencies = {
  get: typeof get;
  head: typeof head;
  put: typeof put;
  wait: (milliseconds: number) => Promise<void>;
};

class BlobDocumentVersionConflictError extends Error {
  constructor() {
    super("La lectura de Blob cambió mientras se comprobaba su versión.");
    this.name = "BlobDocumentVersionConflictError";
  }
}

class BlobDocumentIncompleteReadError extends Error {
  constructor(pathname: string, expectedBytes: number, receivedBytes: number) {
    super(
      `La lectura de ${pathname} quedó incompleta (${receivedBytes}/${expectedBytes} bytes).`,
    );
    this.name = "BlobDocumentIncompleteReadError";
  }
}

const defaultBlobDependencies: BlobDocumentDependencies = {
  get,
  head,
  put,
  wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

const diskQueues = new Map<string, Promise<void>>();

export async function readUtf8Stream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

function isConflict(error: unknown): boolean {
  return (
    error instanceof BlobDocumentVersionConflictError ||
    error instanceof BlobPreconditionFailedError ||
    (error instanceof Error && (
      error.name === "BlobDocumentVersionConflictError" ||
      error.name === "BlobPreconditionFailedError"
    ))
  );
}

function isRetryableBlobReadError(error: unknown): boolean {
  return (
    isConflict(error) ||
    error instanceof BlobDocumentIncompleteReadError ||
    (error instanceof Error && error.name === "BlobDocumentIncompleteReadError") ||
    (error instanceof SyntaxError && /unexpected end/i.test(error.message))
  );
}

function normalizedEtag(value: string): string {
  return value.trim().replace(/^W\//i, "").replace(/^"(.*)"$/, "$1");
}

function retryDelay(attempt: number): number {
  return Math.min(1_000, 50 * (2 ** attempt));
}

async function readBlobMetadata(
  pathname: string,
  auth: Awaited<ReturnType<typeof blobAuthOptions>>,
  dependencies: BlobDocumentDependencies,
) {
  try {
    return await dependencies.head(pathname, auth);
  } catch (error) {
    if (
      error instanceof BlobNotFoundError ||
      (error instanceof Error && error.name === "BlobNotFoundError")
    ) {
      return null;
    }
    throw error;
  }
}

async function readVersionedBlobDocument<T>(
  options: BlobDocumentOptions<T>,
  dependencies: BlobDocumentDependencies = defaultBlobDependencies,
): Promise<VersionedBlobDocument<T>> {
  const auth = await blobAuthOptions("private");
  const response = await dependencies.get(options.pathname, { ...auth, useCache: false });
  const metadata = await readBlobMetadata(options.pathname, auth, dependencies);
  if (!response) {
    if (metadata) throw new BlobDocumentVersionConflictError();
    return { value: options.empty(), etag: null, exists: false };
  }
  if (response.statusCode !== 200 || !response.stream) {
    throw new Error(`No se pudo leer ${options.pathname} (HTTP ${response.statusCode}).`);
  }
  if (
    !metadata?.etag ||
    normalizedEtag(response.blob.etag) !== normalizedEtag(metadata.etag)
  ) {
    throw new BlobDocumentVersionConflictError();
  }
  const raw = await readUtf8Stream(response.stream);
  const receivedBytes = new TextEncoder().encode(raw).byteLength;
  if (receivedBytes !== metadata.size) {
    throw new BlobDocumentIncompleteReadError(
      options.pathname,
      metadata.size,
      receivedBytes,
    );
  }
  return {
    value: options.parse(raw),
    etag: metadata.etag,
    exists: true,
  };
}

export async function readBlobJsonDocument<T>(
  options: BlobDocumentOptions<T>,
  dependencies: BlobDocumentDependencies = defaultBlobDependencies,
): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return (await readVersionedBlobDocument(options, dependencies)).value;
    } catch (error) {
      if (!isRetryableBlobReadError(error) || attempt === 3) throw error;
      await dependencies.wait(retryDelay(attempt));
    }
  }
  throw new Error(`No se pudo leer una versión estable de ${options.pathname}.`);
}

export async function mutateBlobJsonDocument<T, R>(
  options: BlobDocumentOptions<T>,
  mutation: JsonMutation<T, R>,
  maxAttempts = 8,
  dependencies: BlobDocumentDependencies = defaultBlobDependencies,
): Promise<R> {
  const auth = await blobAuthOptions("private");

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let current: VersionedBlobDocument<T>;
    try {
      current = await readVersionedBlobDocument(options, dependencies);
    } catch (error) {
      if (!isRetryableBlobReadError(error)) throw error;
      if (attempt + 1 < maxAttempts) await dependencies.wait(retryDelay(attempt));
      continue;
    }
    const outcome = await mutation(current.value);
    if (outcome.changed === false) return outcome.result;

    try {
      await dependencies.put(options.pathname, `${JSON.stringify(outcome.next, null, 2)}\n`, {
        ...auth,
        contentType: "application/json",
        addRandomSuffix: false,
        cacheControlMaxAge: Math.max(60, options.cacheControlMaxAge ?? 60),
        maximumSizeInBytes: options.maximumSizeInBytes,
        ...(current.exists && current.etag
          ? { ifMatch: current.etag }
          : { allowOverwrite: false }),
      });
      return outcome.result;
    } catch (error) {
      if (isConflict(error)) {
        if (attempt + 1 < maxAttempts) await dependencies.wait(retryDelay(attempt));
        continue;
      }
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
