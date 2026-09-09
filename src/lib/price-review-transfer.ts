import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { REVIEW_LOCK_SUFFIX, type ReviewSftpClient } from "./price-review-store";

export const REVIEW_READ_OPTIONS = Object.freeze({ concurrency: 8, chunkSize: 32_768 });

export interface ReviewTransferClient extends ReviewSftpClient {
  fastGet(remotePath: string, localPath: string, options: typeof REVIEW_READ_OPTIONS): Promise<unknown>;
}

// Limit this adapter to the review transaction. Writes and lock ownership stay unchanged.
export function withParallelReviewReads(client: ReviewTransferClient): ReviewSftpClient {
  return {
    async get(remotePath) {
      if (remotePath.endsWith(REVIEW_LOCK_SUFFIX)) return client.get(remotePath);
      const directory = await mkdtemp(path.join(tmpdir(), "regionatlas-review-read-"));
      const localPath = path.join(directory, "document.json");
      try {
        // fastGet needs a filename; reserve private scratch space, never a shared cache.
        await writeFile(localPath, Buffer.alloc(0), { flag: "wx", mode: 0o600 });
        await client.fastGet(remotePath, localPath, REVIEW_READ_OPTIONS);
        return await readFile(localPath);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    put: (bytes, remotePath, options) => client.put(bytes, remotePath, options),
    delete: (remotePath) => client.delete(remotePath),
    posixRename: (from, to) => client.posixRename(from, to),
  };
}
