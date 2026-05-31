import { execFile } from "node:child_process";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "util";

import {
  buildReviewPrompt,
  FINDINGS_PATH,
  runReviewAgent,
} from "../../packages/reviewer-runner/src/agent.js";
import { parseFindingsFile } from "../../packages/reviewer-runner/src/findings.js";
import {
  listPrFiles,
  writePrFilesList,
} from "../../packages/reviewer-runner/src/git-scope.js";
import {
  prepareDiff,
} from "../../.cursor/skills/ai-code-review/scripts/prepare-diff.ts";
import { getOutDir } from "../config.js";
import { PATHS, WORK_DIR } from "./invocation.js";
import { assertCaseFromFile } from "./assert-case.js";
import { loadExpectFile } from "./expect.js";
import type { JudgeFn } from "./judge.js";

const execFileAsync = promisify(execFile);

export type E2ePins = {
  base_sha: string;
  head_sha: string;
  source_ref: string;
  target_ref: string;
};

export type E2eRunResult = {
  worktreePath: string;
  prompt: string;
  findingsPath: string;
  pass: boolean;
  assertion: Awaited<ReturnType<typeof assertCaseFromFile>>;
};

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function loadE2ePins(caseDir: string): Promise<E2ePins> {
  const text = await readFile(path.join(caseDir, "pins.json"), "utf8");
  const data = JSON.parse(text) as Record<string, unknown>;
  const pins: E2ePins = {
    base_sha: String(data.base_sha ?? ""),
    head_sha: String(data.head_sha ?? ""),
    source_ref: String(data.source_ref ?? ""),
    target_ref: String(data.target_ref ?? ""),
  };
  for (const [key, value] of Object.entries(pins)) {
    if (!value || value === "main") {
      throw new Error(`pins.json ${key} must be a pinned ref or SHA, not "main"`);
    }
    if (key.endsWith("_sha") && value.length < 40) {
      throw new Error(`pins.json ${key} must be a full commit SHA`);
    }
  }
  return pins;
}

export async function addE2eWorktree(
  monorepoRoot: string,
  worktreePath: string,
  headSha: string,
): Promise<void> {
  await mkdir(path.dirname(worktreePath), { recursive: true });
  await execFileAsync(
    "git",
    ["worktree", "add", "--detach", worktreePath, headSha],
    { cwd: monorepoRoot },
  );
}

export async function removeE2eWorktree(
  monorepoRoot: string,
  worktreePath: string,
): Promise<void> {
  if (!(await pathExists(worktreePath))) return;
  await execFileAsync("git", ["worktree", "remove", "--force", worktreePath], {
    cwd: monorepoRoot,
  }).catch(async () => {
    await execFileAsync("git", ["worktree", "prune"], { cwd: monorepoRoot });
  });
}

export async function seedE2eInputs(
  caseDir: string,
  worktreeRoot: string,
): Promise<{ prFilesPath: string; knownIssuesPath: string }> {
  const aiDir = path.join(worktreeRoot, ".ai-code-review");
  await mkdir(aiDir, { recursive: true });

  const prFilesPath = path.join(aiDir, "pr-files.txt");
  const knownIssuesPath = path.join(aiDir, "known-issues.json");
  const inputsDir = path.join(caseDir, "inputs");

  await copyFile(path.join(inputsDir, "pr-files.txt"), prFilesPath);
  await copyFile(path.join(inputsDir, "known-issues.json"), knownIssuesPath);

  return { prFilesPath, knownIssuesPath };
}

export async function refreshE2ePrFilesInput(options: {
  caseDir: string;
  monorepoRoot: string;
  pins: E2ePins;
}): Promise<void> {
  const files = await listPrFiles(
    options.pins.base_sha,
    options.pins.head_sha,
    options.monorepoRoot,
  );
  const ledgerOnly = files.filter((f) => f.startsWith("packages/ledger-lite/"));
  const dest = path.join(options.caseDir, "inputs", "pr-files.txt");
  await writePrFilesList(ledgerOnly, dest);
}

export function buildE2eReviewPrompt(options: {
  worktreeRoot: string;
  pins: E2ePins;
  prFilesPath: string;
  knownIssuesPath: string;
  prTitle?: string;
}): string {
  const base = buildReviewPrompt({
    repoRoot: options.worktreeRoot,
    sourceRef: options.pins.source_ref,
    targetRef: options.pins.target_ref,
    headSha: options.pins.head_sha,
    prFilesPath: options.prFilesPath,
    knownIssuesPath: options.knownIssuesPath,
    prTitle: options.prTitle,
    knownIssuesCount: 0,
  });

  return [
    base,
    "",
    "E2E eval constraints (mandatory):",
    "- FULL review only: run prepare-diff with --source matching Source ref and --target matching Target branch. Never pass --since-commit.",
    '- The "Commit:" line is PR HEAD for metadata only; it is NOT "Since commit" and must not be used as an incremental boundary.',
    "- If .ai-code-review/work/diff.json already exists with files.length > 0, use it as the diff; do not replace it with an empty incremental diff.",
    "- If you must regenerate the diff, use full mode (merge-base to head) without --since-commit.",
  ].join("\n");
}

async function readPrFilesSet(prFilesPath: string): Promise<Set<string>> {
  const text = await readFile(prFilesPath, "utf8");
  return new Set(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  );
}

/** Pre-seed diff so the orchestrator has a non-empty scoped diff (full base..head). */
export async function seedE2eDiff(
  worktreeRoot: string,
  pins: E2ePins,
  prFilesPath: string,
): Promise<void> {
  const prFiles = await readPrFilesSet(prFilesPath);
  const diff = await prepareDiff({
    source: pins.head_sha,
    target: pins.base_sha,
    prFiles,
    cwd: worktreeRoot,
  });

  await mkdir(path.join(worktreeRoot, WORK_DIR), { recursive: true });
  await writeFile(
    path.join(worktreeRoot, PATHS.diff),
    JSON.stringify(diff, null, 2),
    "utf8",
  );
}

export async function runE2eCase(options: {
  caseDir: string;
  caseId: string;
  monorepoRoot: string;
  runId: string;
  apiKey: string;
  judgeFn: JudgeFn;
  artifactDir: string;
  dryRun?: boolean;
}): Promise<E2eRunResult> {
  const pins = await loadE2ePins(options.caseDir);
  const caseExpect = await loadExpectFile(path.join(options.caseDir, "expect.json"));

  const worktreePath = path.join(
    getOutDir(),
    options.runId,
    "worktrees",
    options.caseId,
  );

  await addE2eWorktree(options.monorepoRoot, worktreePath, pins.head_sha);

  try {
    const { prFilesPath, knownIssuesPath } = await seedE2eInputs(
      options.caseDir,
      worktreePath,
    );

    await seedE2eDiff(worktreePath, pins, prFilesPath);

    const prompt = buildE2eReviewPrompt({
      worktreeRoot: worktreePath,
      pins,
      prFilesPath,
      knownIssuesPath,
      prTitle: `eval e2e ${options.caseId}`,
    });

    await writeFile(path.join(options.artifactDir, "review-prompt.txt"), prompt, "utf8");

    const findingsPath = path.join(worktreePath, FINDINGS_PATH);

    if (!options.dryRun) {
      await runReviewAgent({
        apiKey: options.apiKey,
        repoRoot: worktreePath,
        sourceRef: pins.source_ref,
        targetRef: pins.target_ref,
        headSha: pins.head_sha,
        prFilesPath,
        knownIssuesPath,
        prTitle: `eval e2e ${options.caseId}`,
        knownIssuesCount: 0,
        prompt,
      });
    }

    const assertion = await assertCaseFromFile({
      expect: caseExpect,
      artifactPath: findingsPath,
      artifactKind: "findings",
      judgeFn: options.judgeFn,
    });

    if (await pathExists(findingsPath)) {
      await copyFile(
        findingsPath,
        path.join(options.artifactDir, "findings.json"),
      );
    }

    return {
      worktreePath,
      prompt,
      findingsPath,
      pass: assertion.pass,
      assertion,
    };
  } finally {
    await removeE2eWorktree(options.monorepoRoot, worktreePath);
  }
}

/** Structural pre-check used by tests without invoking the agent. */
export async function parseE2eFindingsFile(
  findingsPath: string,
): Promise<Awaited<ReturnType<typeof parseFindingsFile>>> {
  return parseFindingsFile(findingsPath);
}
