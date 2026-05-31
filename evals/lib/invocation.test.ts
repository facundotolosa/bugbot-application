import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MODEL_ID,
  PATHS,
  SETTING_SOURCES,
  SUBAGENT_TYPES,
  buildComponentHarnessPrompt,
  performanceTaskPrompt,
  securityTaskPrompt,
  validatorTaskPrompt,
} from "./invocation.js";

const REPO_ROOT = join(import.meta.dirname, "../..");

function readAgentName(filename: string): string {
  const content = readFileSync(
    join(REPO_ROOT, ".cursor/agents", filename),
    "utf8",
  );
  const match = content.match(/^name:\s*(.+)$/m);
  if (!match) throw new Error(`name not found in ${filename}`);
  return match[1]!.trim();
}

describe("invocation parity", () => {
  it("exports production model and settingSources", () => {
    expect(MODEL_ID).toBe("composer-2.5");
    expect(SETTING_SOURCES).toEqual(["project"]);
  });

  it("securityTaskPrompt matches SKILL.md exactly (two lines)", () => {
    expect(securityTaskPrompt()).toBe(
      [
        "Read diff from: .ai-code-review/work/diff.json",
        "Write findings to: .ai-code-review/work/security-findings.json",
      ].join("\n"),
    );
  });

  it("performanceTaskPrompt matches SKILL.md exactly (two lines)", () => {
    expect(performanceTaskPrompt()).toBe(
      [
        "Read diff from: .ai-code-review/work/diff.json",
        "Write findings to: .ai-code-review/work/performance-findings.json",
      ].join("\n"),
    );
  });

  it("validatorTaskPrompt matches SKILL.md exactly (three lines)", () => {
    expect(validatorTaskPrompt()).toBe(
      [
        "Read findings from: .ai-code-review/work/raw-findings.json",
        "Read known issues from: .ai-code-review/known-issues.json",
        "Write output to: .ai-code-review/work/validator-output.json",
      ].join("\n"),
    );
  });

  it("SUBAGENT_TYPES match .cursor/agents frontmatter name", () => {
    expect(SUBAGENT_TYPES.security).toBe(
      readAgentName("ai-code-review-security-analyzer.md"),
    );
    expect(SUBAGENT_TYPES.performance).toBe(
      readAgentName("ai-code-review-performance-analyzer.md"),
    );
    expect(SUBAGENT_TYPES.validator).toBe(
      readAgentName("ai-code-review-validator.md"),
    );
  });

  it("PATHS align with SKILL.md analyzer and validator tables", () => {
    expect(PATHS.diff).toBe(".ai-code-review/work/diff.json");
    expect(PATHS.securityFindings).toBe(
      ".ai-code-review/work/security-findings.json",
    );
    expect(PATHS.performanceFindings).toBe(
      ".ai-code-review/work/performance-findings.json",
    );
    expect(PATHS.validatorOutput).toBe(
      ".ai-code-review/work/validator-output.json",
    );
    expect(PATHS.knownIssues).toBe(".ai-code-review/known-issues.json");
  });

  it("buildComponentHarnessPrompt embeds subagent_type and task lines only", () => {
    const prompt = buildComponentHarnessPrompt(SUBAGENT_TYPES.security, [
      "line-a",
      "line-b",
    ]);
    expect(prompt).toContain(`subagent_type: ${SUBAGENT_TYPES.security}`);
    expect(prompt).toContain("line-a\nline-b");
    expect(prompt).not.toMatch(/severity|false.?positive|root.?cause/i);
  });
});
