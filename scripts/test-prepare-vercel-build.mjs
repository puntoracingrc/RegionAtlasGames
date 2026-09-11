import assert from "node:assert/strict";
import test from "node:test";
import { isEphemeralVercelCheckout, prepareVercelBuild } from "./prepare-vercel-build.mjs";

const sha = "a".repeat(40);
const env = { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_SHA: sha };
test("local checkouts, worktrees, CLI builds and incomplete build identity are never eligible", () => {
  for (const root of ["/Users/me/repo", "/home/runner/work/repo", "/tmp/vercel/path0", "/vercel/path0/child", "/vercel/path0/../other"]) {
    assert.equal(isEphemeralVercelCheckout(root, env, "linux"), false, root);
  }
  assert.equal(isEphemeralVercelCheckout("/vercel/path0", env, "darwin"), false);
  for (const key of Object.keys(env)) {
    const incomplete = { ...env }; delete incomplete[key];
    assert.equal(isEphemeralVercelCheckout("/vercel/path0", incomplete, "linux"), false);
  }
  assert.equal(isEphemeralVercelCheckout("/vercel/path0", env, "linux"), true);
});

function harness({ kind = "directory", commit = sha, root = "/vercel/path0" } = {}) {
  const removed = [];
  const result = () => prepareVercelBuild({ cwd: root, env, platform: "linux", log: () => {},
    filesystem: { realpathSync: () => root, lstatSync: () => ({ isDirectory: () => kind !== "file", isSymbolicLink: () => kind === "symlink" }),
      rmSync: (...args) => removed.push(args) },
    execute: (command) => command === "git" ? commit : "7820000\t/vercel/path0/.git\n",
  });
  return { result, removed };
}
test("only .git in the verified disposable checkout is removed", () => {
  const h = harness(); assert.equal(h.result().removed, true);
  assert.deepEqual(h.removed, [["/vercel/path0/.git", { recursive: true, force: false }]]);
});
test("worktree files, symlinks and source commit mismatches preserve all files", () => {
  for (const kind of ["file", "symlink"]) { const h = harness({ kind }); assert.equal(h.result().removed, false); assert.deepEqual(h.removed, []); }
  const h = harness({ commit: "b".repeat(40) });
  assert.throws(h.result, /does not match/); assert.deepEqual(h.removed, []);
});
test("a resolved local path cannot reach the deletion step", () => {
  const h = harness({ root: "/Users/macbookpro14/Projects/regionatlas-ps2-regional-v2" });
  assert.equal(h.result().removed, false); assert.deepEqual(h.removed, []);
});
