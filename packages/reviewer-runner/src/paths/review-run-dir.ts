import { mkdir } from "node:fs/promises";
import { join, relative } from "node:path";

export const AI_CODE_REVIEW_DIR = ".ai-code-review";

export const REVIEW_RUN_FILES = {
  findings: "findings.json",
  findingsMarkdown: "findings.md",
  validatorSummary: "validator-summary.json",
  prepareDiff: "prepare-diff.json",
  prFiles: "pr-files.txt",
  knownIssues: "known-issues.json",
  runArtifacts: "run-artifacts",
} as const;

/** Filesystem-safe ISO timestamp for review run folder names. */
export function formatReviewRunTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace(/:/g, "-").replace(/\./g, "-");
}

export function reviewRunRelativeDir(timestamp?: Date): string {
  return join(AI_CODE_REVIEW_DIR, formatReviewRunTimestamp(timestamp));
}

export async function createReviewRunDir(
  repoRoot: string,
  timestamp?: Date,
): Promise<string> {
  const abs = join(repoRoot, reviewRunRelativeDir(timestamp));
  await mkdir(abs, { recursive: true });
  return abs;
}

export function findingsPathInRun(runDir: string): string {
  return join(runDir, REVIEW_RUN_FILES.findings);
}

export function findingsReportRelativePath(runDir: string, repoRoot: string): string {
  return relative(repoRoot, findingsPathInRun(runDir));
}

export function findingsMarkdownReportRelativePath(
  runDir: string,
  repoRoot: string,
): string {
  return relative(repoRoot, join(runDir, REVIEW_RUN_FILES.findingsMarkdown));
}

export function runArtifactsDirInRun(runDir: string): string {
  return join(runDir, REVIEW_RUN_FILES.runArtifacts);
}
