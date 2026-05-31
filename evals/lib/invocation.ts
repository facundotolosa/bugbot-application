/** Parity with `packages/reviewer-runner/src/agent/agent.ts` and `.cursor/skills/ai-code-review/SKILL.md`. */

import path from "node:path";

import {
  buildSessionManifest,
  type SessionManifest,
} from "./session.js";

export const MODEL_ID = "composer-2.5";

export const SETTING_SOURCES = ["project"] as const;

/** Basenames for files inside a timestamped review run directory. */
export const REVIEW_RUN_FILENAMES = {
  knownIssues: "known-issues.json",
  findings: "findings.json",
  validatorSummary: "validator-summary.json",
  prFiles: "pr-files.txt",
} as const;

/** @deprecated Use paths inside a timestamped review run directory. */
export const DURABLE_PATHS = {
  knownIssues: ".ai-code-review/known-issues.json",
  findings: ".ai-code-review/findings.json",
  validatorSummary: ".ai-code-review/validator-summary.json",
} as const;

export function reviewRunInputPaths(reviewRunDir: string) {
  return {
    knownIssues: path.join(reviewRunDir, REVIEW_RUN_FILENAMES.knownIssues),
    findings: path.join(reviewRunDir, REVIEW_RUN_FILENAMES.findings),
    validatorSummary: path.join(reviewRunDir, REVIEW_RUN_FILENAMES.validatorSummary),
    prFiles: path.join(reviewRunDir, REVIEW_RUN_FILENAMES.prFiles),
  };
}

/** `subagent_type` values — must match `.cursor/agents/*.md` frontmatter `name`. */
export const SUBAGENT_TYPES = {
  security: "ai-code-review-security-analyzer",
  performance: "ai-code-review-performance-analyzer",
  validator: "ai-code-review-validator",
} as const;

export function sessionPaths(sessionDir: string): SessionManifest {
  return buildSessionManifest(sessionDir);
}

/** Two-line security analyzer Task prompt (absolute session paths). */
export function securityTaskPrompt(sessionDir: string): string {
  const p = sessionPaths(sessionDir);
  return [
    `Read diff from: ${p.diff}`,
    `Write findings to: ${p.security}`,
  ].join("\n");
}

/** Two-line performance analyzer Task prompt (absolute session paths). */
export function performanceTaskPrompt(sessionDir: string): string {
  const p = sessionPaths(sessionDir);
  return [
    `Read diff from: ${p.diff}`,
    `Write findings to: ${p.performance}`,
  ].join("\n");
}

/** Three-line validator Task prompt (absolute session paths). */
export function validatorTaskPrompt(
  sessionDir: string,
  knownIssuesPath: string,
): string {
  const p = sessionPaths(sessionDir);
  return [
    `Read findings from: ${p.raw}`,
    `Read known issues from: ${knownIssuesPath}`,
    `Write output to: ${p.validatorOut}`,
  ].join("\n");
}

export type HarnessPromptOptions = {
  sessionDir: string;
  workspaceRoot: string;
};

/**
 * Eval harness agent prompt: launch one Task with production `subagent_type` and
 * minimal task lines only (agent rules load via `settingSources`, not inline here).
 */
export function buildComponentHarnessPrompt(
  subagentType: string,
  taskPrompt: string,
): string {
  return [
    "You are an eval harness. Use the Task tool exactly once, then stop.",
    "",
    `subagent_type: ${subagentType}`,
    "",
    "Task prompt (verbatim — do not add agent rules or extra instructions):",
    taskPrompt,
    "",
    "After the Task completes, stop. Do not write output files yourself.",
  ].join("\n");
}
