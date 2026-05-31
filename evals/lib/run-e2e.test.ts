import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "util";
import { describe, expect, it } from "vitest";

import { prepareDiff } from "../../.cursor/skills/ai-code-review/scripts/prepare-diff.ts";
import {
  buildE2eReviewPrompt,
  loadE2ePins,
  refreshE2ePrFilesInput,
} from "./run-e2e.js";

const execFileAsync = promisify(execFile);
const REPO_ROOT = join(import.meta.dirname, "../..");
const SECURITY_CASE = join(
  import.meta.dirname,
  "../cases/e2e/ledger-security",
);

describe("e2e pins and prompt", () => {
  it("loads full SHAs and rejects main as a ref", async () => {
    const pins = await loadE2ePins(SECURITY_CASE);
    expect(pins.head_sha).toHaveLength(40);
    expect(pins.target_ref).not.toBe("main");
    expect(pins.source_ref).toContain("eval/e2e");
  });

  it("rejects main as target_ref", async () => {
    const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const dir = await mkdtemp(join(tmpdir(), "bad-pins-"));
    try {
      await writeFile(
        join(dir, "pins.json"),
        JSON.stringify({
          base_sha: "a".repeat(40),
          head_sha: "b".repeat(40),
          source_ref: "eval/x",
          target_ref: "main",
        }),
        "utf8",
      );
      await expect(loadE2ePins(dir)).rejects.toThrow(/main/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("buildE2eReviewPrompt requires full review (not incremental since HEAD)", async () => {
    const pins = await loadE2ePins(SECURITY_CASE);
    const worktreeRoot = "/tmp/eval-worktree";
    const prFilesPath = join(worktreeRoot, ".ai-code-review/pr-files.txt");
    const knownIssuesPath = join(worktreeRoot, ".ai-code-review/known-issues.json");

    const prompt = buildE2eReviewPrompt({
      worktreeRoot,
      pins,
      prFilesPath,
      knownIssuesPath,
    });

    expect(prompt).toContain("FULL review only");
    expect(prompt).toContain("Never pass --since-commit");
    expect(prompt).toContain("session diff.json");
  });

  it("buildE2eReviewPrompt includes frozen input paths and head SHA", async () => {
    const pins = await loadE2ePins(SECURITY_CASE);
    const worktreeRoot = "/tmp/eval-worktree";
    const prFilesPath = join(worktreeRoot, ".ai-code-review/pr-files.txt");
    const knownIssuesPath = join(worktreeRoot, ".ai-code-review/known-issues.json");

    const prompt = buildE2eReviewPrompt({
      worktreeRoot,
      pins,
      prFilesPath,
      knownIssuesPath,
    });

    expect(prompt).toContain(pins.head_sha);
    expect(prompt).toContain("pr-files.txt");
    expect(prompt).toContain("known-issues.json");
    expect(prompt).toContain(pins.source_ref);
  });

  it("head commit only touches packages/ledger-lite/", async () => {
    const pins = await loadE2ePins(SECURITY_CASE);
    const { stdout } = await execFileAsync(
      "git",
      ["show", "--stat", "--format=", pins.head_sha],
      { cwd: REPO_ROOT },
    );
    expect(stdout).toContain("packages/ledger-lite/");
    expect(stdout).not.toMatch(/packages\/reviewer-runner\//);
  });

  it("prepareDiff for ledger-pipeline pins yields scoped file changes", async () => {
    const caseDir = join(import.meta.dirname, "../cases/e2e/ledger-pipeline");
    const pins = await loadE2ePins(caseDir);
    const prFilesText = await readFile(join(caseDir, "inputs/pr-files.txt"), "utf8");
    const prFiles = new Set(
      prFilesText
        .trim()
        .split("\n")
        .filter((line) => line.length > 0),
    );

    const diff = await prepareDiff({
      source: pins.head_sha,
      target: pins.base_sha,
      prFiles,
      cwd: REPO_ROOT,
    });

    expect(diff.files.length).toBeGreaterThan(0);
    expect(diff.files[0]?.path).toContain("transactions-export");
  });

  it("refreshE2ePrFilesInput writes ledger-lite paths only", async () => {
    const pins = await loadE2ePins(SECURITY_CASE);
    const { mkdtemp, readFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const tmpCase = await mkdtemp(join(tmpdir(), "e2e-refresh-"));
    const { cp } = await import("node:fs/promises");
    await cp(
      join(SECURITY_CASE, "pins.json"),
      join(tmpCase, "pins.json"),
    );
    await cp(join(SECURITY_CASE, "inputs"), join(tmpCase, "inputs"), {
      recursive: true,
    });

    try {
      await refreshE2ePrFilesInput({
        caseDir: tmpCase,
        monorepoRoot: REPO_ROOT,
        pins,
      });
      const text = await readFile(join(tmpCase, "inputs/pr-files.txt"), "utf8");
      const lines = text
        .trim()
        .split("\n")
        .filter((line) => line.length > 0);
      expect(lines.every((l) => l.startsWith("packages/ledger-lite/"))).toBe(
        true,
      );
      expect(lines).toContain("packages/ledger-lite/src/api/client.ts");
    } finally {
      await rm(tmpCase, { recursive: true, force: true });
    }
  });
});
