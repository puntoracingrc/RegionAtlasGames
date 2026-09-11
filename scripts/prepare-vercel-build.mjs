import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function isEphemeralVercelCheckout(root, env, platform) {
  return platform === "linux"
    && env.VERCEL === "1"
    && ["preview", "production"].includes(env.VERCEL_ENV)
    && /^[a-f0-9]{40}$/i.test(env.VERCEL_GIT_COMMIT_SHA ?? "")
    && /^\/vercel\/path\d+$/.test(root);
}

/** Release only the build container's disposable Git clone, never local Git. */
export function prepareVercelBuild({ cwd = process.cwd(), env = process.env,
  platform = process.platform, filesystem = fs, execute = execFileSync, log = console.log } = {}) {
  const root = filesystem.realpathSync(cwd);
  if (!isEphemeralVercelCheckout(root, env, platform)) {
    log("Vercel build preparation: no disposable checkout to clean.");
    return { removed: false };
  }
  const target = path.join(root, ".git");
  const stat = filesystem.lstatSync(target, { throwIfNoEntry: false });
  // Worktrees use a .git file. Symlinks could point outside the build container.
  if (!stat?.isDirectory() || stat.isSymbolicLink()) {
    log("Vercel build preparation: Git metadata is not an isolated directory.");
    return { removed: false };
  }
  const commit = execute("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  if (commit !== env.VERCEL_GIT_COMMIT_SHA) throw new Error("Build checkout does not match Vercel's source commit");
  const kib = Number(execute("du", ["-sk", target], { encoding: "utf8" }).split(/\s/)[0]);
  if (!Number.isFinite(kib) || kib <= 0) throw new Error("Could not measure disposable Git metadata");
  filesystem.rmSync(target, { recursive: true, force: false });
  const result = { removed: true, target, commit, releasedKiB: kib };
  log(JSON.stringify({ event: "vercel_disposable_git_removed", ...result }));
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) prepareVercelBuild();
