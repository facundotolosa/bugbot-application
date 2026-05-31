import { describe, expect, it } from "vitest";
import { buildReviewPrompt } from "./agent.js";

const REPO = "/repo";
const RUN_DIR = `${REPO}/.ai-code-review/2026-05-31T12-00-00-000Z`;
const HEAD_SHA = "c".repeat(40);
const SINCE = "a".repeat(40);

describe("buildReviewPrompt", () => {
  it("uses a short skill invocation with file parameters", () => {
    const prompt = buildReviewPrompt({
      repoRoot: REPO,
      reviewRunDir: RUN_DIR,
      sourceRef: HEAD_SHA,
      targetRef: "main",
      headSha: HEAD_SHA,
      sourceBranch: "feature/foo",
      sinceCommit: SINCE,
      prFilesPath: `${RUN_DIR}/pr-files.txt`,
      knownIssuesPath: `${RUN_DIR}/known-issues.json`,
    });
    expect(prompt).toContain("ai-code-review skill");
    expect(prompt).toContain("SKILL.md");
    expect(prompt).toContain(`Source ref: ${HEAD_SHA}`);
    expect(prompt).toContain("Target branch: main");
    expect(prompt).toContain(`Commit: ${HEAD_SHA}`);
    expect(prompt).toContain(`Source branch: feature/foo`);
    expect(prompt).toContain(`Since commit: ${SINCE}`);
    expect(prompt).toContain(`Review output directory: ${RUN_DIR}`);
    expect(prompt).toContain(`Report file: ${RUN_DIR}/findings.json`);
    expect(prompt).toContain(`Known issues file: ${RUN_DIR}/known-issues.json`);
    expect(prompt).toContain(`PR files file: ${RUN_DIR}/pr-files.txt`);
    expect(prompt).toContain(`Repository root: ${REPO}`);
    expect(prompt).toContain("Shell cwd: run every Bash command from the repository root");
    expect(prompt).toContain("Execution context: CI");
    expect(prompt).not.toMatch(/Execution context:.*findings\.md/i);
    expect(prompt).not.toContain("prepare-diff.ts");
    expect(prompt).not.toContain("## Required steps");
    expect(prompt).not.toContain("Orchestrator contract:");
  });

  it("omits optional since commit and source branch when absent", () => {
    const prompt = buildReviewPrompt({
      repoRoot: REPO,
      reviewRunDir: RUN_DIR,
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
    expect(buildReviewPrompt({
      repoRoot: REPO,
      reviewRunDir: RUN_DIR,
      sourceRef: HEAD_SHA,
      targetRef: "main",
      headSha: HEAD_SHA,
    })).not.toContain("E2E eval constraints");
  });
});
