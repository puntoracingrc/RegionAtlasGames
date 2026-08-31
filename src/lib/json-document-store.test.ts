import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  mutateBlobJsonDocument,
  readBlobJsonDocument,
  mutateDiskJsonDocument,
  readDiskJsonDocument,
  readUtf8Stream,
} from "./json-document-store";
import type { get, head, put } from "@vercel/blob";

type CounterDocument = { count: number };

function parseCounter(raw: string): CounterDocument {
  const parsed = JSON.parse(raw) as Partial<CounterDocument>;
  if (!Number.isInteger(parsed.count) || Number(parsed.count) < 0) {
    throw new Error("Counter document is invalid.");
  }
  return { count: Number(parsed.count) };
}

function blobGetResult(value: CounterDocument, etag: string) {
  const raw = JSON.stringify(value);
  return {
    statusCode: 200 as const,
    stream: new Response(raw).body!,
    headers: new Headers(),
    blob: {
      url: "https://example.private.blob.vercel-storage.com/counter.json",
      downloadUrl: "https://example.private.blob.vercel-storage.com/counter.json?download=1",
      pathname: "counter.json",
      contentType: "application/json",
      contentDisposition: "",
      cacheControl: "private, max-age=0",
      size: new TextEncoder().encode(raw).byteLength,
      uploadedAt: new Date(0),
      etag,
    },
  };
}

function truncatedBlobGetResult(value: CounterDocument, etag: string) {
  const raw = JSON.stringify(value);
  return {
    ...blobGetResult(value, etag),
    stream: new Response(raw.slice(0, -1)).body!,
  };
}

function blobHeadResult(etag: string) {
  return {
    url: "https://example.private.blob.vercel-storage.com/counter.json",
    downloadUrl: "https://example.private.blob.vercel-storage.com/counter.json?download=1",
    pathname: "counter.json",
    size: 12,
    uploadedAt: new Date(0),
    contentType: "application/json",
    contentDisposition: "",
    cacheControl: "private, max-age=0",
    etag,
  };
}

test("reads UTF-8 Blob streams directly across chunk boundaries", async () => {
  const encoder = new TextEncoder();
  const bytes = encoder.encode('{"label":"Colección PS5"}');
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, 17));
      controller.enqueue(bytes.slice(17));
      controller.close();
    },
  });

  assert.equal(await readUtf8Stream(stream), '{"label":"Colección PS5"}');
});

test("retries a truncated Blob stream before parsing the document", async () => {
  let reads = 0;
  const waits: number[] = [];
  const dependencies = {
    get: (async () => {
      reads += 1;
      return reads === 1
        ? truncatedBlobGetResult({ count: 7 }, '"same"')
        : blobGetResult({ count: 7 }, '"same"');
    }) as typeof get,
    head: (async () => blobHeadResult("same")) as typeof head,
    put: (async () => blobHeadResult("next")) as typeof put,
    wait: async (milliseconds: number) => {
      waits.push(milliseconds);
    },
  };

  const result = await readBlobJsonDocument(
    {
      pathname: "counter.json",
      empty: (): CounterDocument => ({ count: 0 }),
      parse: parseCounter,
    },
    dependencies,
  );

  assert.deepEqual(result, { count: 7 });
  assert.equal(reads, 2);
  assert.deepEqual(waits, [50]);
});

test("retries a stale Blob read and writes with the authoritative ETag", async () => {
  let reads = 0;
  let writes = 0;
  const waits: number[] = [];
  const dependencies = {
    get: (async () => {
      reads += 1;
      return reads === 1
        ? blobGetResult({ count: 1 }, '"stale"')
        : blobGetResult({ count: 2 }, '"current"');
    }) as typeof get,
    head: (async () => blobHeadResult("current")) as typeof head,
    put: (async (_pathname, body, options) => {
      writes += 1;
      assert.equal(options.ifMatch, "current");
      assert.match(String(body), /"count": 3/);
      return blobHeadResult("next");
    }) as typeof put,
    wait: async (milliseconds: number) => {
      waits.push(milliseconds);
    },
  };

  const result = await mutateBlobJsonDocument(
    {
      pathname: "counter.json",
      empty: (): CounterDocument => ({ count: 0 }),
      parse: parseCounter,
    },
    (current) => {
      const next = { count: current.count + 1 };
      return { next, result: next.count };
    },
    3,
    dependencies,
  );

  assert.equal(result, 3);
  assert.equal(reads, 2);
  assert.equal(writes, 1);
  assert.deepEqual(waits, [50]);
});

test("accepts equivalent quoted and unquoted Blob ETags", async () => {
  const dependencies = {
    get: (async () => blobGetResult({ count: 4 }, 'W/"same"')) as typeof get,
    head: (async () => blobHeadResult("same")) as typeof head,
    put: (async (_pathname, _body, options) => {
      assert.equal(options.ifMatch, "same");
      return blobHeadResult("next");
    }) as typeof put,
    wait: async () => undefined,
  };

  const result = await mutateBlobJsonDocument(
    {
      pathname: "counter.json",
      empty: (): CounterDocument => ({ count: 0 }),
      parse: parseCounter,
    },
    (current) => ({ next: { count: current.count + 1 }, result: current.count + 1 }),
    2,
    dependencies,
  );

  assert.equal(result, 5);
});

test("serializes concurrent disk mutations without losing updates", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "region-atlas-json-store-"));
  const pathname = path.join(directory, "counter.json");
  const options = {
    pathname,
    empty: (): CounterDocument => ({ count: 0 }),
    parse: parseCounter,
  };

  try {
    await Promise.all(
      Array.from({ length: 50 }, () =>
        mutateDiskJsonDocument(options, async (current) => {
          await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 4)));
          const next = { count: current.count + 1 };
          return { next, result: next.count };
        }),
      ),
    );

    assert.deepEqual(await readDiskJsonDocument(options), { count: 50 });
    assert.match(await readFile(pathname, "utf8"), /"count": 50/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("does not turn a corrupt document into an empty one", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "region-atlas-json-store-"));
  const pathname = path.join(directory, "counter.json");
  try {
    await writeFile(pathname, "{broken", "utf8");
    await assert.rejects(() =>
      readDiskJsonDocument({
        pathname,
        empty: (): CounterDocument => ({ count: 0 }),
        parse: parseCounter,
      }),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
