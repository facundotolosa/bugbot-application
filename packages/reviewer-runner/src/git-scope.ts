import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import {
  filterPathsByReviewPackages,
  loadReviewPackagesFromConfig,
} from "../../../.cursor/skills/ai-code-review/scripts/review-scope.js";
import type { FoundTrackingComment } from "./github.js";
import * as log from "./logger.js";

const execFileAsync = promisify(execFile);

export type ReviewMode = "full" | "incremental";
export type SkipReason = "pure-sync" | "empty-effective-scope";

export interface GitRunner {
  shaExists(sha: string, cwd: string): Promise<boolean>;
  isAncestor(ancestor: string, head: string, cwd: string): Promise<boolean>;
  fetchOriginSha(sha: string, cwd: string): Promise<void>;
  fetchDeepen(cwd: string): Promise<void>;
  listPrFiles(base: string, head: string, cwd: string): Promise<string[]>;
  listIncrementalFiles(since: string, head: string, cwd: string): Promise<string[]>;
  firstParentLog(since: string, head: string, cwd: string): Promise<string>;
}

export interface EffectiveScope {
  prFiles: string[];
  incrementalFiles: string[];
  effectiveFiles: string[];
}

export interface ShouldSkipAgentInput {
  mode: ReviewMode;
  sinceCommit?: string;
  base: string;
  head: string;
  cwd: string;
  runner?: GitRunner;
}

export interface ShouldSkipAgentResult extends EffectiveScope {
  skip: boolean;
  reason?: SkipReason;
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

function parseNameOnlyOutput(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function gitStdout(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

async function gitExitOk(args: string[], cwd: string): Promise<boolean> {
  try {
    await execFileAsync("git", args, { cwd });
    return true;
  } catch {
    return false;
  }
}

export function intersectFiles(prFiles: string[], incrementalFiles: string[]): string[] {
  const incremental = new Set(incrementalFiles);
  return prFiles.filter((file) => incremental.has(file));
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
    async listPrFiles(base, head, cwd) {
      const stdout = await gitStdout(
        ["diff", "--name-only", "--diff-filter=ACMR", `${base}...${head}`],
        cwd,
      );
      return parseNameOnlyOutput(stdout);
    },
    async listIncrementalFiles(since, head, cwd) {
      const stdout = await gitStdout(["diff", "--name-only", `${since}..${head}`], cwd);
      return parseNameOnlyOutput(stdout);
    },
    async firstParentLog(since, head, cwd) {
      return gitStdout(
        ["log", "--no-merges", "--first-parent", `${since}..${head}`, "--oneline"],
        cwd,
      );
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

/** @deprecated Logging removed — mode is visible in orchestrator 📋 block and Review Summary. */
export function logReviewMode(_result: ResolveReviewModeResult): void {}

/** @deprecated Logging removed — scope is visible in orchestrator output and Review Summary. */
export function logReviewScope(_mode: ReviewMode, _scope: EffectiveScope): void {}

export async function listPrFiles(
  base: string,
  head: string,
  cwd: string,
  runner: GitRunner = createExecGitRunner(),
): Promise<string[]> {
  return runner.listPrFiles(base, head, cwd);
}

export async function listIncrementalFiles(
  since: string,
  head: string,
  cwd: string,
  runner: GitRunner = createExecGitRunner(),
): Promise<string[]> {
  return runner.listIncrementalFiles(since, head, cwd);
}

export async function isPureSync(
  since: string,
  head: string,
  cwd: string,
  runner: GitRunner = createExecGitRunner(),
): Promise<boolean> {
  const log = await runner.firstParentLog(since, head, cwd);
  return log.trim() === "";
}

export async function applyReviewPackageScope(
  paths: string[],
  cwd: string,
): Promise<string[]> {
  const reviewPackages = await loadReviewPackagesFromConfig(cwd);
  return filterPathsByReviewPackages(paths, reviewPackages);
}

export async function computeEffectiveScope(
  input: ShouldSkipAgentInput,
): Promise<EffectiveScope> {
  const runner = input.runner ?? createExecGitRunner();
  const rawPrFiles = await runner.listPrFiles(input.base, input.head, input.cwd);
  const prFiles = await applyReviewPackageScope(rawPrFiles, input.cwd);

  if (input.mode === "incremental" && input.sinceCommit) {
    const rawIncremental = await runner.listIncrementalFiles(
      input.sinceCommit,
      input.head,
      input.cwd,
    );
    const incrementalFiles = await applyReviewPackageScope(rawIncremental, input.cwd);
    return {
      prFiles,
      incrementalFiles,
      effectiveFiles: intersectFiles(prFiles, incrementalFiles),
    };
  }

  return { prFiles, incrementalFiles: prFiles, effectiveFiles: prFiles };
}

export async function shouldSkipAgent(
  input: ShouldSkipAgentInput,
): Promise<ShouldSkipAgentResult> {
  const runner = input.runner ?? createExecGitRunner();
  const scope = await computeEffectiveScope({ ...input, runner });

  if (input.mode === "incremental" && input.sinceCommit) {
    const pureSync = await isPureSync(input.sinceCommit, input.head, input.cwd, runner);
    if (pureSync && scope.effectiveFiles.length === 0) {
      return { ...scope, skip: true, reason: "pure-sync" };
    }
    if (pureSync && scope.effectiveFiles.length > 0) {
      log.warn("first-parent log empty but effective scope has files; not treating as pure-sync");
    }
  }

  if (scope.effectiveFiles.length === 0) {
    return { ...scope, skip: true, reason: "empty-effective-scope" };
  }

  return { ...scope, skip: false };
}

export async function writePrFilesList(files: string[], filePath: string): Promise<void> {
  const body = files.length > 0 ? `${files.join("\n")}\n` : "";
  await writeFile(filePath, body, "utf8");
}
