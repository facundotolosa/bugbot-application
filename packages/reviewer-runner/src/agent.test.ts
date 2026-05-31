import { describe, expect, it } from "vitest";
import { buildReviewPrompt } from "./agent.js";

const REPO = "/repo";
const HEAD_SHA = "c".repeat(40);
const SINCE = "a".repeat(40);

describe("buildReviewPrompt", () => {
  it("uses a short skill invocation with file parameters", () => {
    const prompt = buildReviewPrompt({
      repoRoot: REPO,
      sourceRef: HEAD_SHA,
      targetRef: "main",
      headSha: HEAD_SHA,
      sourceBranch: "feature/foo",
      sinceCommit: SINCE,
      prFilesPath: `${REPO}/.ai-code-review/pr-files.txt`,
      knownIssuesPath: `${REPO}/.ai-code-review/known-issues.json`,
    });
    expect(prompt).toContain("ai-code-review skill");
    expect(prompt).toContain("SKILL.md");
    expect(prompt).toContain(`Source ref: ${HEAD_SHA}`);
    expect(prompt).toContain("Target branch: main");
    expect(prompt).toContain(`Commit: ${HEAD_SHA}`);
    expect(prompt).toContain(`Source branch: feature/foo`);
    expect(prompt).toContain(`Since commit: ${SINCE}`);
    expect(prompt).toContain(`Report file: ${REPO}/.ai-code-review/findings.json`);
    expect(prompt).toContain(`Known issues file: ${REPO}/.ai-code-review/known-issues.json`);
    expect(prompt).toContain(`PR files file: ${REPO}/.ai-code-review/pr-files.txt`);
    expect(prompt).not.toContain("prepare-diff.ts");
    expect(prompt).not.toContain("## Required steps");
    expect(prompt).toContain(
      "All orchestrator stdout lines must be in English",
    );
  });

  it("omits optional since commit and source branch when absent", () => {
    const prompt = buildReviewPrompt({
      repoRoot: REPO,
      sourceRef: HEAD_SHA,
      targetRef: "main",
      headSha: HEAD_SHA,
    });
    expect(prompt).not.toContain("Since commit:");
    expect(prompt).not.toContain("Source branch:");
  });
});

describe("runReviewAgent prompt option", () => {
  it("RunReviewAgentOptions accepts a custom prompt override", () => {
    const custom = "E2E eval constraints: FULL review only";
    const options = {
      apiKey: "test-key",
      repoRoot: REPO,
      sourceRef: HEAD_SHA,
      targetRef: "main",
      headSha: HEAD_SHA,
      prompt: custom,
    };
    expect(options.prompt).toBe(custom);
    expect(buildReviewPrompt(options)).not.toContain("E2E eval constraints");
  });
});
