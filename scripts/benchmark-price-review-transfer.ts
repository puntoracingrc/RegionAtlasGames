import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import Sftp from "ssh2-sftp-client";
import { assertReviewHistoryPreserved, atomicReviewWrite, withReviewLock } from "../src/lib/price-review-store";
import { REVIEW_READ_OPTIONS, withParallelReviewReads, type ReviewTransferClient } from "../src/lib/price-review-transfer";

// Opt-in benchmark: synthetic documents only, in a newly created UUID directory.
const { values } = parseArgs({ options: {
  "remote-root": { type: "string" }, output: { type: "string" },
} });
if (!values["remote-root"] || !values.output) throw new Error("Required: --remote-root <worker root> --output <report.json>");
const root = values["remote-root"].replace(/\/+$/, "");
if (!root || root.split("/").includes("..")) throw new Error("Invalid remote root");
const env = process.env;
const config = {
  host: env.PRICE_WORKER_SFTP_HOST || env.COVERS_FTP_HOST || env.PRICE_WORKER_SSH_HOST,
  username: env.PRICE_WORKER_SFTP_USER || env.COVERS_FTP_USER || env.PRICE_WORKER_SSH_USER,
  password: env.PRICE_WORKER_SFTP_PASSWORD || env.COVERS_FTP_PASSWORD || env.PRICE_WORKER_SSH_PASSWORD,
  port: Number(env.PRICE_WORKER_SFTP_PORT || env.COVERS_FTP_PORT || env.PRICE_WORKER_SSH_PORT || 22),
  retries: 0, readyTimeout: 15_000,
};
if (!config.host || !config.username || !config.password) throw new Error("SFTP environment is incomplete");

type BenchmarkClient = ReviewTransferClient & {
  connect(config: Record<string, unknown>): Promise<void>;
  mkdir(remotePath: string): Promise<unknown>;
  list(remotePath: string): Promise<Array<{ name: string; type: string }>>;
  rmdir(remotePath: string): Promise<unknown>;
  exists(remotePath: string): Promise<unknown>;
  end(): Promise<void>;
};

async function main() {
  const client = new Sftp() as unknown as BenchmarkClient;
  const runId = randomUUID();
  const directory = path.posix.join(root, "jobs", `review-transfer-benchmark-${runId}`);
  const original = {
    items: [{ id: "synthetic", listingTitle: "Synthetic benchmark, not an actual listing", status: "pending" }],
    decisions: [], syntheticPayload: "x".repeat(18 * 1024 * 1024),
  };
  const next = { ...original, decisions: [{ id: "synthetic", action: "reject" }] };
  const learning = { synthetic: true, examples: "x".repeat(400 * 1024) };
  const serialize = (value: unknown) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  const expectedBytes = serialize(next);
  const results: Array<{ mode: string; durationMs: number; queueReadbacks: number; learningReadbacks: number; sha256: string }> = [];
  const report = {
    runId, startedAt: new Date().toISOString(), synthetic: true, runtime: process.version,
    queueBytes: expectedBytes.length, learningBytes: serialize(learning).length,
    parallelReadOptions: REVIEW_READ_OPTIONS, remoteDirectory: directory,
    results, remoteCleaned: false, pass: false,
  };
  let created = false;
  try {
    await client.connect(config);
    await client.mkdir(directory);
    created = true;
    for (const mode of ["stream", "parallel-read"] as const) {
      const queuePath = path.posix.join(directory, `queue-${mode}.json`);
      const learningPath = path.posix.join(directory, `learning-${mode}.json`);
      await client.put(serialize(original), queuePath, { writeStreamOptions: { flags: "wx" } });
      const transport = mode === "stream" ? client : withParallelReviewReads(client);
      const counts = { queue: 0, learning: 0 };
      const verified = {
        get: async (remotePath: string) => {
          const bytes = await transport.get(remotePath);
          if (!remotePath.endsWith(".lock")) {
            if (remotePath.startsWith(queuePath)) {
              counts.queue++;
              assert.deepEqual(bytes, counts.queue === 1 ? serialize(original) : expectedBytes);
            } else {
              counts.learning++;
              assert.deepEqual(bytes, serialize(learning));
            }
          }
          return bytes;
        },
        put: transport.put.bind(transport), delete: transport.delete.bind(transport),
        posixRename: transport.posixRename.bind(transport),
      };
      const start = performance.now();
      await withReviewLock(verified, queuePath, async (previous) => {
        assertReviewHistoryPreserved(previous, next);
        await atomicReviewWrite(verified, queuePath, next);
        await atomicReviewWrite(verified, learningPath, learning);
      });
      assert.equal(counts.queue, 3);
      assert.equal(counts.learning, 2);
      assert.equal(await client.exists(`${queuePath}.lock`), false);
      const result = {
        mode, durationMs: Math.round(performance.now() - start), queueReadbacks: counts.queue,
        learningReadbacks: counts.learning, sha256: createHash("sha256").update(expectedBytes).digest("hex"),
      };
      results.push(result);
      console.log(JSON.stringify(result));
    }
    report.pass = true;
  } finally {
    try {
      if (created) {
        const files = await client.list(directory);
        // Refuse cleanup if anything outside this run's naming contract appears.
        for (const file of files) {
          if (file.type !== "-" || !/^(queue|learning)-(stream|parallel-read)\.json(?:\.(?:lock|[a-f0-9-]+\.tmp))?$/.test(file.name)) {
            throw new Error("Unexpected benchmark artifact; preserve directory for inspection");
          }
        }
        for (const file of files) await client.delete(path.posix.join(directory, file.name));
        await client.rmdir(directory);
        report.remoteCleaned = !(await client.exists(directory));
      }
    } finally {
      await client.end();
      await writeFile(values.output!, `${JSON.stringify({ ...report, finishedAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
