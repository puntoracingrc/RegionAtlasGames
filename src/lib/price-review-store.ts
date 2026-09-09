import { randomUUID } from "crypto";

export interface ReviewSftpClient {
  get(path: string): Promise<Buffer>;
  put(bytes: Buffer, path: string, options?: { writeStreamOptions: { flags: string } }): Promise<unknown>;
  delete(path: string): Promise<unknown>;
  posixRename(from: string, to: string): Promise<unknown>;
}

// Shared with pc_sftp_worker.py. Never steal a lock by age: its owner may still be writing.
export const REVIEW_LOCK_SUFFIX = ".lock";

export function validateReviewDocument(value: unknown): asserts value is {
  items: Array<Record<string, unknown>>;
  decisions: Array<Record<string, unknown>>;
} {
  if (!value || typeof value !== "object") throw new Error("Cola de revisión inválida.");
  const doc = value as Record<string, unknown>;
  if (!Array.isArray(doc.items) || !Array.isArray(doc.decisions)) {
    throw new Error("Cola incompleta: faltan elementos o historial. No se sobrescribe.");
  }
  const ids = new Set<string>();
  for (const item of doc.items) {
    if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id)
      || typeof item.listingTitle !== "string" || !["pending", "accepted", "rejected"].includes(item.status)) {
      throw new Error("Cola con elementos inválidos o IDs duplicados. No se sobrescribe.");
    }
    ids.add(item.id);
  }
  if (doc.decisions.some((event) => !event || typeof event !== "object" || Array.isArray(event))) {
    throw new Error("Historial de revisión inválido. No se sobrescribe.");
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function assertReviewHistoryPreserved(previous: unknown, next: unknown): void {
  validateReviewDocument(previous);
  validateReviewDocument(next);
  const ids = new Set(next.items.map((item) => item.id));
  if (previous.items.some((item) => !ids.has(item.id))) throw new Error("El guardado eliminaría elementos de la cola. Cancelado.");
  const events = new Set(next.decisions.map(canonical));
  if (previous.decisions.some((event) => !events.has(canonical(event)))) throw new Error("El guardado eliminaría decisiones históricas. Cancelado.");
}

export async function atomicReviewWrite(client: ReviewSftpClient, path: string, value: unknown): Promise<void> {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await client.put(bytes, temporary, { writeStreamOptions: { flags: "wx" } });
    if (!(await client.get(temporary)).equals(bytes)) throw new Error("Subida incompleta; se conserva la versión anterior.");
    await client.posixRename(temporary, path);
    if (!(await client.get(path)).equals(bytes)) throw new Error("No se pudo confirmar el guardado remoto. Actualiza antes de reintentar.");
  } finally {
    await client.delete(temporary).catch(() => undefined);
  }
}

export async function withReviewLock<R>(
  client: ReviewSftpClient,
  queuePath: string,
  operation: (raw: unknown) => Promise<R>,
): Promise<R> {
  const lockPath = queuePath + REVIEW_LOCK_SUFFIX;
  const owner = Buffer.from(JSON.stringify({ owner: randomUUID(), at: new Date().toISOString(), writer: "web" }));
  try {
    await client.put(owner, lockPath, { writeStreamOptions: { flags: "wx" } });
  } catch {
    throw new Error("No se pudo bloquear la cola: otro guardado puede estar en curso o el servidor no está disponible. No se ha aplicado la decisión.");
  }
  try {
    const raw: unknown = JSON.parse((await client.get(queuePath)).toString("utf8"));
    validateReviewDocument(raw);
    return await operation(raw);
  } finally {
    // On an uncertain connection leave the lock for audited recovery, not a blind unlink.
    if (!(await client.get(lockPath)).equals(owner)) throw new Error("El propietario del bloqueo cambió. Guardado no confirmado.");
    await client.delete(lockPath);
  }
}
