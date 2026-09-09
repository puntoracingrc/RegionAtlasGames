import assert from "node:assert/strict";
import test from "node:test";
import { readAuthoritativeReviewDocument } from "./price-review-reader";

const queue = { items: [{ id: "one", listingTitle: "Game", status: "pending" }], decisions: [{ id: "old", action: "reject" }] };
const jsonFetch = (value: unknown, status = 200): typeof fetch => async () => new Response(JSON.stringify(value), { status });

test("authoritative HTTP reads are uncached, bounded and preserve the complete document", async () => {
  const result = await readAuthoritativeReviewDocument({
    url: "https://worker.test/queue.json?t=1",
    fetcher: async (url, init) => {
      assert.equal(url, "https://worker.test/queue.json?t=1");
      assert.equal(init?.cache, "no-store");
      assert.ok(init?.signal instanceof AbortSignal);
      return new Response(JSON.stringify(queue));
    },
    readSftp: async () => assert.fail("SFTP must not run for a valid HTTP read"),
  });
  assert.deepEqual(result, queue);
});

test("failed HTTP reads use the live SFTP document and report only the status code", async () => {
  const failures: unknown[] = [];
  const fresh = { ...queue, items: [...queue.items, { id: "new", listingTitle: "New game", status: "pending" }] };
  assert.deepEqual(await readAuthoritativeReviewDocument({
    url: "https://worker.test/queue.json", fetcher: jsonFetch({ error: "private" }, 403),
    readSftp: async () => fresh, onFailure: (event) => failures.push(event),
  }), fresh);
  assert.deepEqual(failures, [{ transport: "http", code: "HTTP_403" }]);
});

test("network failures and malformed HTTP JSON can recover without stale local data", async () => {
  const broken: typeof fetch = async () => { throw new TypeError("private endpoint", { cause: { code: "ECONNRESET" } }); };
  const malformed: typeof fetch = async () => new Response("<html>error</html>");
  for (const fetcher of [broken, malformed]) {
    assert.deepEqual(await readAuthoritativeReviewDocument({ url: "https://worker.test", fetcher, readSftp: async () => queue }), queue);
  }
});

test("an incomplete or duplicate HTTP document never replaces the full authoritative queue", async () => {
  for (const invalid of [{ items: [] }, { ...queue, items: [queue.items[0], queue.items[0]] }]) {
    assert.deepEqual(await readAuthoritativeReviewDocument({ url: "https://worker.test", fetcher: jsonFetch(invalid), readSftp: async () => queue }), queue);
  }
});

test("both transports failing leaves decisions blocked and never exposes error messages or URLs", async () => {
  const failures: unknown[] = [];
  await assert.rejects(readAuthoritativeReviewDocument({
    url: "https://private.test/queue", fetcher: jsonFetch(null, 503),
    readSftp: async () => { throw new Error("password=SECRET hostname=PRIVATE"); },
    onFailure: (event) => failures.push(event),
  }), (error: Error) => {
    assert.match(error.message, /http: HTTP_503; sftp: Error/);
    assert.match(error.message, /No se utiliza una copia local incompleta/);
    assert.doesNotMatch(error.message, /SECRET|PRIVATE|private.test/);
    return true;
  });
  assert.deepEqual(failures, [{ transport: "http", code: "HTTP_503" }, { transport: "sftp", code: "Error" }]);
});

test("invalid SFTP data fails closed even when HTTP is unavailable", async () => {
  for (const invalid of [null, { items: [] }, { ...queue, items: [queue.items[0], queue.items[0]] }]) {
    await assert.rejects(readAuthoritativeReviewDocument({ url: "https://worker.test", fetcher: jsonFetch(null, 404), readSftp: async () => invalid }), /No se pudo leer/);
  }
});

test("successive recoveries read the current SFTP contents rather than a cached snapshot", async () => {
  let reads = 0;
  const options = { url: "https://worker.test", fetcher: jsonFetch(null, 404), readSftp: async () => ({ ...queue, updatedAt: String(++reads) }) };
  assert.equal((await readAuthoritativeReviewDocument(options) as { updatedAt: string }).updatedAt, "1");
  assert.equal((await readAuthoritativeReviewDocument(options) as { updatedAt: string }).updatedAt, "2");
});
