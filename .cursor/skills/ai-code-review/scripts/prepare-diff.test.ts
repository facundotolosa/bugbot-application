import { describe, expect, it, vi } from "vitest";
import {
  computePrSize,
  countDiffLineStats,
  filterReviewableFiles,
  getIgnorePatternId,
  prepareDiff,
  resolveDiffBase,
  type PrepareDiffGit,
} from "./prepare-diff.js";

const SINCE = "a".repeat(40);
const MERGE_BASE = "b".repeat(40);

describe("getIgnorePatternId", () => {
  it("matches lockfiles and build output paths", () => {
    expect(getIgnorePatternId("yarn.lock")).toBe("lockfile");
    expect(getIgnorePatternId("packages/app/dist/index.js")).toBe("build-output");
  });
});

describe("filterReviewableFiles", () => {
  it("drops paths outside pr-files and ignored paths", () => {
    const prFiles = new Set(["src/a.ts", "yarn.lock", "dist/bundle.js"]);
    const result = filterReviewableFiles(
      ["src/a.ts", "src/out-of-pr.ts", "yarn.lock", "dist/bundle.js"],
      prFiles,
    );
    expect(result.reviewable).toEqual(["src/a.ts"]);
    expect(result.excludedCount).toBe(3);
    expect(result.excludedPatterns["out-of-pr"]).toBe(1);
    expect(result.excludedPatterns.lockfile).toBe(1);
    expect(result.excludedPatterns["build-output"]).toBe(1);
  });

  it("excludes in-pr paths outside reviewPackages", () => {
    const prFiles = new Set([
      "packages/reviewer-runner/src/a.ts",
      "packages/ledger-lite/src/b.ts",
    ]);
    const result = filterReviewableFiles(
      ["packages/reviewer-runner/src/a.ts", "packages/ledger-lite/src/b.ts"],
      prFiles,
      ["packages/reviewer-runner"],
    );
    expect(result.reviewable).toEqual(["packages/reviewer-runner/src/a.ts"]);
    expect(result.excludedPatterns["review-package"]).toBe(1);
  });
});

describe("resolveDiffBase", () => {
  it("uses since-commit when it is an ancestor", async () => {
    const result = await resolveDiffBase({
      sinceCommit: SINCE,
      mergeBase: MERGE_BASE,
      isAncestor: async () => true,
    });
    expect(result).toEqual({
      diffBase: SINCE,
      is_incremental: true,
      since_commit: SINCE,
      warnings: [],
    });
  });

  it("falls back to merge base with warning when since-commit is invalid", async () => {
    const result = await resolveDiffBase({
      sinceCommit: SINCE,
      mergeBase: MERGE_BASE,
      isAncestor: async () => false,
    });
    expect(result.is_incremental).toBe(false);
    expect(result.diffBase).toBe(MERGE_BASE);
    expect(result.warnings[0]).toMatch(/full review fallback/i);
  });
});

describe("computePrSize", () => {
  it("classifies small, medium, and large diffs", () => {
    expect(computePrSize(5, 100, 100)).toBe("small");
    expect(computePrSize(20, 1000, 1000)).toBe("medium");
    expect(computePrSize(40, 3000, 3000)).toBe("large");
  });
});

describe("countDiffLineStats", () => {
  it("counts added and removed lines from unified diff", () => {
    const diff = ["--- a", "+++ b", "@@", "-old", "+new"].join("\n");
    expect(countDiffLineStats(diff)).toEqual({ added: 1, removed: 1 });
  });
});

describe("prepareDiff", () => {
  it("builds metadata and per-file diffs from git runner", async () => {
    const git: PrepareDiffGit = {
      mergeBase: vi.fn().mockResolvedValue(MERGE_BASE),
      isAncestor: vi.fn().mockResolvedValue(true),
      listChangedFiles: vi
        .fn()
        .mockResolvedValue(["src/a.ts", "yarn.lock", "src/out-of-pr.ts"]),
      fileDiff: vi.fn().mockResolvedValue("--- a\n+++ b\n@@\n-old\n+new\n"),
    };

    const result = await prepareDiff({
      source: "HEAD",
      target: "main",
      sinceCommit: SINCE,
      prFiles: new Set(["src/a.ts", "yarn.lock"]),
      cwd: "/repo",
      git,
    });

    expect(result.metadata.is_incremental).toBe(true);
    expect(result.metadata.since_commit).toBe(SINCE);
    expect(result.metadata.total_files).toBe(1);
    expect(result.metadata.files_excluded).toBe(2);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe("src/a.ts");
    expect(result.files[0].lines_added).toBe(1);
    expect(result.files[0].lines_removed).toBe(1);
  });
});
