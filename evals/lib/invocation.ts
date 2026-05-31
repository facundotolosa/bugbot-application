/** Parity with `packages/reviewer-runner/src/agent.ts` and `.cursor/skills/ai-code-review/SKILL.md`. */

import path from "node:path";

export const MODEL_ID = "composer-2.5";

export const SETTING_SOURCES = ["project"] as const;

export const WORK_DIR = ".ai-code-review/work";

export const PATHS = {
  diff: `${WORK_DIR}/diff.json`,
  securityFindings: `${WORK_DIR}/security-findings.json`,
  performanceFindings: `${WORK_DIR}/performance-findings.json`,
  rawFindings: `${WORK_DIR}/raw-findings.json`,
  validatorOutput: `${WORK_DIR}/validator-output.json`,
  knownIssues: ".ai-code-review/known-issues.json",
  findings: ".ai-code-review/findings.json",
} as const;

/** `subagent_type` values — must match `.cursor/agents/*.md` frontmatter `name`. */
export const SUBAGENT_TYPES = {
  security: "ai-code-review-security-analyzer",
  performance: "ai-code-review-performance-analyzer",
  validator: "ai-code-review-validator",
} as const;

export const SECURITY_TASK_LINES = [
  `Read diff from: ${PATHS.diff}`,
  `Write findings to: ${PATHS.securityFindings}`,
] as const;

export const PERFORMANCE_TASK_LINES = [
  `Read diff from: ${PATHS.diff}`,
  `Write findings to: ${PATHS.performanceFindings}`,
] as const;

export const VALIDATOR_TASK_LINES = [
  `Read findings from: ${PATHS.rawFindings}`,
  `Read known issues from: ${PATHS.knownIssues}`,
  `Write output to: ${PATHS.validatorOutput}`,
] as const;

/** Two-line security analyzer Task prompt (verbatim per SKILL.md). */
export function securityTaskPrompt(): string {
  return SECURITY_TASK_LINES.join("\n");
}

/** Two-line performance analyzer Task prompt (verbatim per SKILL.md). */
export function performanceTaskPrompt(): string {
  return PERFORMANCE_TASK_LINES.join("\n");
}

/** Three-line validator Task prompt (verbatim per SKILL.md). */
export function validatorTaskPrompt(): string {
  return VALIDATOR_TASK_LINES.join("\n");
}

/** Map SKILL-relative paths to absolute paths under an isolated eval workspace. */
export function absolutizeTaskPromptLines(
  taskPromptLines: readonly string[],
  workspaceRoot: string,
): string[] {
  const replacements: [string, string][] = [
    [PATHS.diff, path.join(workspaceRoot, PATHS.diff)],
    [PATHS.securityFindings, path.join(workspaceRoot, PATHS.securityFindings)],
    [PATHS.performanceFindings, path.join(workspaceRoot, PATHS.performanceFindings)],
    [PATHS.rawFindings, path.join(workspaceRoot, PATHS.rawFindings)],
    [PATHS.validatorOutput, path.join(workspaceRoot, PATHS.validatorOutput)],
    [PATHS.knownIssues, path.join(workspaceRoot, PATHS.knownIssues)],
  ];

  return taskPromptLines.map((line) => {
    let updated = line;
    for (const [rel, abs] of replacements) {
      updated = updated.replace(rel, abs);
    }
    return updated;
  });
}

export type HarnessPromptOptions = {
  /** When set, Task lines use absolute paths (harness `cwd` should be monorepo root). */
  workspaceRoot?: string;
};

/**
 * Eval harness agent prompt: launch one Task with production `subagent_type` and
 * minimal task lines only (agent rules load via `settingSources`, not inline here).
 */
export function buildComponentHarnessPrompt(
  subagentType: string,
  taskPromptLines: readonly string[],
  options?: HarnessPromptOptions,
): string {
  const lines = options?.workspaceRoot
    ? absolutizeTaskPromptLines(taskPromptLines, options.workspaceRoot)
    : [...taskPromptLines];
  const taskPrompt = lines.join("\n");
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
