import assert from "node:assert/strict";
import test from "node:test";
import { assertReviewHistoryPreserved, atomicReviewWrite, validateReviewDocument, withReviewLock, type ReviewSftpClient } from "./price-review-store";

class MemorySftp implements ReviewSftpClient {
  files = new Map<string, Buffer>();
  failUpload = false;
  failReadback = false;
  failRename = false;
  async get(path: string) {
    const value = this.files.get(path);
    if (!value) throw new Error("not readable");
    return this.failReadback && path.endsWith(".tmp") ? Buffer.from("truncated") : value;
  }
  async put(data: Buffer, path: string, options?: { writeStreamOptions: { flags: string } }) {
    if (options?.writeStreamOptions.flags === "wx" && this.files.has(path)) throw new Error("exists");
    this.files.set(path, this.failUpload && path.endsWith(".tmp") ? data.subarray(0, 5) : data);
    if (this.failUpload && path.endsWith(".tmp")) throw new Error("connection lost");
  }
  async delete(path: string) { this.files.delete(path); }
  async posixRename(from: string, to: string) {
    if (this.failRename) throw new Error("rename unavailable");
    this.files.set(to, await this.get(from));
    this.files.delete(from);
  }
}

function fixture() {
  const client = new MemorySftp();
  const queue = { items: [{ id: "one", listingTitle: "Game", status: "pending" }], decisions: [] };
  client.files.set("queue", Buffer.from(JSON.stringify(queue)));
  return { client, queue };
}

test("strict validation refuses invalid JSON shapes and duplicate IDs without filtering history", () => {
  const { queue } = fixture();
  for (const invalid of [null, {}, { items: [] }, { ...queue, items: [...queue.items, ...queue.items] }, { ...queue, decisions: [null] }]) {
    assert.throws(() => validateReviewDocument(invalid));
  }
  validateReviewDocument({ ...queue, items: [{ ...queue.items[0], decision: "auto_resolved" }] });
});

test("remote read failure or corrupt JSON never invokes mutation or writes an empty replacement", async () => {
  for (const content of [undefined, Buffer.from('{"items":['), Buffer.from('{}')]) {
    const { client } = fixture();
    if (content) client.files.set("queue", content); else client.files.delete("queue");
    let calls = 0;
    await assert.rejects(withReviewLock(client, "queue", async () => { calls++; }));
    assert.equal(calls, 0);
    assert.deepEqual(client.files.get("queue"), content);
    assert.equal(client.files.has("queue.lock"), false);
  }
});

test("two concurrent writers cannot read-modify-write simultaneously; retry reads committed state", async () => {
  const { client } = fixture();
  let unlock!: () => void;
  const gate = new Promise<void>((resolve) => { unlock = resolve; });
  let entered!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const first = withReviewLock(client, "queue", async (raw) => {
    entered();
    await gate;
    const next = raw as { decisions: unknown[] };
    next.decisions.push({ id: "one", action: "reject" });
    await atomicReviewWrite(client, "queue", next);
  });
  await started;
  await assert.rejects(withReviewLock(client, "queue", async () => assert.fail("second writer entered")), /bloquear/);
  assert.equal(client.files.has("queue.lock"), true);
  unlock();
  await first;
  await withReviewLock(client, "queue", async (raw) => {
    assert.equal((raw as { decisions: unknown[] }).decisions.length, 1);
  });
});

test("upload, readback and atomic-rename failures preserve the previous complete file", async () => {
  for (const failure of ["failUpload", "failReadback", "failRename"] as const) {
    const { client } = fixture();
    const previous = client.files.get("queue");
    client[failure] = true;
    await assert.rejects(atomicReviewWrite(client, "queue", { changed: true }));
    assert.deepEqual(client.files.get("queue"), previous);
    assert.equal([...client.files.keys()].filter((key) => key.endsWith(".tmp")).length, 0);
  }
});

test("successful save returns only after identical readback and retains more than 5000 events", async () => {
  const { client, queue } = fixture();
  const next = { ...queue, decisions: Array.from({ length: 6001 }, (_, id) => ({ id })) };
  await withReviewLock(client, "queue", async () => atomicReviewWrite(client, "queue", next));
  assert.deepEqual(JSON.parse((await client.get("queue")).toString()), next);
  assert.equal(client.files.has("queue.lock"), false);
});

test("preexisting PC lock is not overwritten or removed by a web writer", async () => {
  const { client } = fixture();
  const lock = Buffer.from('{"owner":"pc","at":"2000-01-01"}');
  client.files.set("queue.lock", lock);
  await assert.rejects(withReviewLock(client, "queue", async () => assert.fail()));
  assert.deepEqual(client.files.get("queue.lock"), lock);
});

test("a commit cannot remove any previous ID or historical decision", () => {
  const { queue } = fixture();
  const previous = { ...queue, decisions: [{ id: "historic", action: "reject" }] };
  assert.throws(() => assertReviewHistoryPreserved(previous, { ...previous, items: [] }), /eliminaría/);
  assert.throws(() => assertReviewHistoryPreserved(previous, queue), /históricas/);
  assertReviewHistoryPreserved(previous, { ...previous, decisions: [{ action: "reject", id: "historic" }, { id: "new" }] });
});
