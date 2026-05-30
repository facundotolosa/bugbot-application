import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { FoundTrackingComment } from "./github.js";

const execFileAsync = promisify(execFile);

export type ReviewMode = "full" | "incremental";

export interface GitRunner {
  shaExists(sha: string, cwd: string): Promise<boolean>;
  isAncestor(ancestor: string, head: string, cwd: string): Promise<boolean>;
  fetchOriginSha(sha: string, cwd: string): Promise<void>;
  fetchDeepen(cwd: string): Promise<void>;
}

export interface ValidateSinceShaResult {
  valid: boolean;
  reason?: string;
}

export interface ResolveReviewModeInput {
  tracking: FoundTrackingComment | null;
  head: string;
  cwd: string;
  runner?: GitRunner;
}

export interface ResolveReviewModeResult {
  mode: ReviewMode;
  sinceCommit?: string;
  reason?: string;
}

async function gitExitOk(args: string[], cwd: string): Promise<boolean> {
  try {
    await execFileAsync("git", args, { cwd });
    return true;
  } catch {
    return false;
  }
}

export function createExecGitRunner(): GitRunner {
  return {
    async shaExists(sha, cwd) {
      return gitExitOk(["cat-file", "-e", sha], cwd);
    },
    async isAncestor(ancestor, head, cwd) {
      return gitExitOk(["merge-base", "--is-ancestor", ancestor, head], cwd);
    },
    async fetchOriginSha(sha, cwd) {
      await execFileAsync("git", ["fetch", "origin", sha], { cwd });
    },
    async fetchDeepen(cwd) {
      await execFileAsync("git", ["fetch", "--deepen=200"], { cwd });
    },
  };
}

export async function shaExists(
  sha: string,
  cwd: string,
  runner: GitRunner = createExecGitRunner(),
): Promise<boolean> {
  return runner.shaExists(sha, cwd);
}

export async function isAncestor(
  ancestor: string,
  head: string,
  cwd: string,
  runner: GitRunner = createExecGitRunner(),
): Promise<boolean> {
  return runner.isAncestor(ancestor, head, cwd);
}

async function tryFetchRecovery(
  since: string,
  cwd: string,
  runner: GitRunner,
): Promise<void> {
  try {
    await runner.fetchOriginSha(since, cwd);
  } catch {
    // best-effort shallow recovery
  }
  try {
    await runner.fetchDeepen(cwd);
  } catch {
    // ignore
  }
}

async function checkSinceSha(
  since: string,
  head: string,
  cwd: string,
  runner: GitRunner,
): Promise<ValidateSinceShaResult> {
  if (!(await runner.shaExists(since, cwd))) {
    return { valid: false, reason: "since-sha-not-found" };
  }
  if (!(await runner.isAncestor(since, head, cwd))) {
    return { valid: false, reason: "since-sha-not-ancestor" };
  }
  return { valid: true };
}

export async function validateSinceSha(
  since: string,
  head: string,
  cwd: string,
  runner: GitRunner = createExecGitRunner(),
): Promise<ValidateSinceShaResult> {
  const first = await checkSinceSha(since, head, cwd, runner);
  if (first.valid) {
    return first;
  }

  await tryFetchRecovery(since, cwd, runner);
  return checkSinceSha(since, head, cwd, runner);
}

export async function resolveReviewMode(
  input: ResolveReviewModeInput,
): Promise<ResolveReviewModeResult> {
  const runner = input.runner ?? createExecGitRunner();

  if (!input.tracking) {
    return { mode: "full", reason: "no-tracking" };
  }

  const since = input.tracking.analyzedSha;
  const validation = await validateSinceSha(since, input.head, input.cwd, runner);
  if (!validation.valid) {
    return { mode: "full", reason: validation.reason };
  }

  return { mode: "incremental", sinceCommit: since };
}

export function logReviewMode(result: ResolveReviewModeResult): void {
  if (result.mode === "incremental") {
    console.log(`[review] mode=incremental since=${result.sinceCommit}`);
    return;
  }
  if (result.reason) {
    console.log(`[review] mode=full (${result.reason})`);
    return;
  }
  console.log("[review] mode=full");
}
