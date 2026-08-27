import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  mutateDiskJsonDocument,
  readDiskJsonDocument,
} from "./json-document-store";

type CounterDocument = { count: number };

function parseCounter(raw: string): CounterDocument {
  const parsed = JSON.parse(raw) as Partial<CounterDocument>;
  if (!Number.isInteger(parsed.count) || Number(parsed.count) < 0) {
    throw new Error("Counter document is invalid.");
  }
  return { count: Number(parsed.count) };
}

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
