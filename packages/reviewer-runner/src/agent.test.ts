import { describe, expect, it } from "vitest";
import { buildReviewPrompt } from "./agent.js";

const REPO = "/repo";
const HEAD_SHA = "c".repeat(40);
const SINCE = "a".repeat(40);

describe("buildReviewPrompt", () => {
  it("points at prepare-diff and omits inlined unified diff", () => {
    const prompt = buildReviewPrompt({
      repoRoot: REPO,
      sourceRef: HEAD_SHA,
      targetRef: "main",
      headSha: HEAD_SHA,
      prFilesPath: `${REPO}/.ai-code-review/pr-files.txt`,
      knownIssuesPath: `${REPO}/.ai-code-review/known-issues.json`,
    });
    expect(prompt).toContain("prepare-diff.ts");
    expect(prompt).toContain("pr-files.txt");
    expect(prompt).toContain("known-issues.json");
    expect(prompt).toContain("📊 Diff stats");
    expect(prompt).toContain("Report written to: .ai-code-review/findings.json");
    expect(prompt).toContain("orchestrator");
    expect(prompt).toContain("subagents");
    expect(prompt).toContain('schema v2');
    expect(prompt).toContain("work/diff.json");
    expect(prompt).not.toContain("```diff");
    expect(prompt).not.toMatch(/runner owns diff/i);
    expect(prompt).toContain("Do not perform heuristic analysis");
  });

  it("includes since commit and incremental prepare-diff flag", () => {
    const prompt = buildReviewPrompt({
      repoRoot: REPO,
      sourceRef: HEAD_SHA,
      targetRef: "main",
      headSha: HEAD_SHA,
      sinceCommit: SINCE,
      prFilesPath: `${REPO}/.ai-code-review/pr-files.txt`,
    });
    expect(prompt).toContain(`Since commit: ${SINCE}`);
    expect(prompt).toContain(`--since-commit ${SINCE}`);
  });
});
