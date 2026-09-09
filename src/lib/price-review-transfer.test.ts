import assert from "node:assert/strict";
import { access, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { atomicReviewWrite, withReviewLock } from "./price-review-store";
import { REVIEW_READ_OPTIONS, withParallelReviewReads, type ReviewTransferClient } from "./price-review-transfer";

class TransferSftp implements ReviewTransferClient {
  files = new Map<string, Buffer>();
  regularReads: string[] = [];
  downloads: string[] = [];
  localPaths: string[] = [];
  writes: Array<{ path: string; flags?: string }> = [];
  failDownload = false;
  corruptRead: "temporary" | "final" | null = null;
  renamed = false;

  async get(remotePath: string) {
    this.regularReads.push(remotePath);
    return this.bytes(remotePath);
  }
  bytes(remotePath: string) {
    const bytes = this.files.get(remotePath);
    if (!bytes) throw new Error("missing file");
    return bytes;
  }
  async fastGet(remotePath: string, localPath: string, options: typeof REVIEW_READ_OPTIONS) {
    assert.deepEqual(options, { concurrency: 8, chunkSize: 32_768 });
    assert.equal((await stat(localPath)).mode & 0o777, 0o600);
    assert.equal((await stat(path.dirname(localPath))).mode & 0o777, 0o700);
    this.downloads.push(remotePath);
    this.localPaths.push(localPath);
    if (this.failDownload) {
      await writeFile(localPath, "partial");
      throw new Error("transfer interrupted");
    }
    const corrupt = (this.corruptRead === "temporary" && remotePath.endsWith(".tmp"))
      || (this.corruptRead === "final" && this.renamed && !remotePath.endsWith(".tmp"));
    await writeFile(localPath, corrupt ? Buffer.from("truncated") : this.bytes(remotePath));
  }
  async put(bytes: Buffer, remotePath: string, options?: { writeStreamOptions: { flags: string } }) {
    this.writes.push({ path: remotePath, flags: options?.writeStreamOptions.flags });
    if (options?.writeStreamOptions.flags === "wx" && this.files.has(remotePath)) throw new Error("exists");
    this.files.set(remotePath, bytes);
  }
  async delete(remotePath: string) { this.files.delete(remotePath); }
  async posixRename(from: string, to: string) {
    this.files.set(to, this.bytes(from));
    this.files.delete(from);
    this.renamed = true;
  }
}

async function assertScratchRemoved(client: TransferSftp) {
  for (const localPath of client.localPaths) {
    await assert.rejects(access(path.dirname(localPath)), { code: "ENOENT" });
  }
}

test("parallel review reads return every byte and remove private scratch files", async () => {
  const client = new TransferSftp();
  const bytes = Buffer.alloc(2 * 1024 * 1024, 42);
  client.files.set("queue.json", bytes);
  assert.deepEqual(await withParallelReviewReads(client).get("queue.json"), bytes);
  assert.deepEqual(client.regularReads, []);
  await assertScratchRemoved(client);
});

test("interrupted or unsupported parallel download fails closed without streaming fallback", async () => {
  const client = new TransferSftp();
  client.failDownload = true;
  await assert.rejects(withParallelReviewReads(client).get("queue.json"), /interrupted/);
  assert.deepEqual(client.regularReads, []);
  assert.deepEqual(client.writes, []);
  await assertScratchRemoved(client);
});

test("separate reads use separate scratch files with no shared cache", async () => {
  const client = new TransferSftp();
  client.files.set("queue.json", Buffer.from("before"));
  const transfer = withParallelReviewReads(client);
  assert.equal((await transfer.get("queue.json")).toString(), "before");
  client.files.set("queue.json", Buffer.from("after"));
  assert.equal((await transfer.get("queue.json")).toString(), "after");
  assert.equal(new Set(client.localPaths).size, 2);
  await assertScratchRemoved(client);
});

test("review transaction keeps exclusive writes, atomic rename and both complete readbacks", async () => {
  const client = new TransferSftp();
  const original = { items: [{ id: "one", listingTitle: "Game", status: "pending" }], decisions: [] };
  client.files.set("queue.json", Buffer.from(JSON.stringify(original)));
  const transfer = withParallelReviewReads(client);
  const next = { ...original, decisions: [{ id: "one", action: "reject" }] };
  await withReviewLock(transfer, "queue.json", async () => atomicReviewWrite(transfer, "queue.json", next));
  assert.deepEqual(JSON.parse(client.bytes("queue.json").toString()), next);
  assert.equal(client.downloads.length, 3);
  assert.equal(client.downloads[0], "queue.json");
  assert.match(client.downloads[1], /^queue\.json\..+\.tmp$/);
  assert.equal(client.downloads[2], "queue.json");
  assert.deepEqual(client.regularReads, ["queue.json.lock"]);
  assert.equal(client.writes.every((entry) => entry.flags === "wx"), true);
  assert.deepEqual([...client.files.keys()], ["queue.json"]);
  await assertScratchRemoved(client);
});

test("a PC-owned lock still prevents all queue reads and writes", async () => {
  const client = new TransferSftp();
  const owner = Buffer.from('{"owner":"pc"}');
  client.files.set("queue.json.lock", owner);
  await assert.rejects(withReviewLock(withParallelReviewReads(client), "queue.json", async () => assert.fail()), /bloquear/);
  assert.deepEqual(client.bytes("queue.json.lock"), owner);
  assert.equal(client.downloads.length, 0);
});

test("a corrupt temporary readback never replaces the authoritative queue", async () => {
  const client = new TransferSftp();
  const before = Buffer.from("before");
  client.files.set("queue.json", before);
  client.corruptRead = "temporary";
  await assert.rejects(atomicReviewWrite(withParallelReviewReads(client), "queue.json", { next: true }), /incompleta/);
  assert.deepEqual(client.bytes("queue.json"), before);
  assert.equal(client.renamed, false);
  await assertScratchRemoved(client);
});

test("a corrupt final readback cannot report a confirmed save", async () => {
  const client = new TransferSftp();
  client.corruptRead = "final";
  await assert.rejects(atomicReviewWrite(withParallelReviewReads(client), "queue.json", { next: true }), /confirmar/);
  assert.equal(client.renamed, true);
  await assertScratchRemoved(client);
});
