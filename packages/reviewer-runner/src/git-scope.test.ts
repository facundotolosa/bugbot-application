import { describe, expect, it, vi } from "vitest";
import type { FoundTrackingComment } from "./github.js";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  type GitRunner,
  applyReviewPackageScope,
  computeEffectiveScope,
  intersectFiles,
  logReviewMode,
  logReviewScope,
  resolveReviewMode,
  shouldSkipAgent,
  validateSinceSha,
  writePrFilesList,
} from "./git-scope.js";
import { REVIEW_CONFIG_RELATIVE } from "./review-scope.js";

const SINCE = "a".repeat(40);
const HEAD = "b".repeat(40);
const CWD = "/repo";

function tracking(sha: string): FoundTrackingComment {
  return {
    commentId: 1,
    analyzedSha: sha,
    at: "2026-05-30T12:00:00.000Z",
  };
}

function mockRunner(overrides: Partial<GitRunner> = {}): GitRunner {
  return {
    shaExists: vi.fn().mockResolvedValue(true),
    isAncestor: vi.fn().mockResolvedValue(true),
    fetchOriginSha: vi.fn().mockResolvedValue(undefined),
    fetchDeepen: vi.fn().mockResolvedValue(undefined),
    listPrFiles: vi.fn().mockResolvedValue(["src/a.ts", "src/b.ts"]),
    listIncrementalFiles: vi.fn().mockResolvedValue(["src/a.ts"]),
    firstParentLog: vi.fn().mockResolvedValue("abc1234 feat: change\n"),
    ...overrides,
  };
}

describe("validateSinceSha", () => {
  it("returns valid when sha exists and is ancestor of head", async () => {
    const runner = mockRunner();
    await expect(validateSinceSha(SINCE, HEAD, CWD, runner)).resolves.toEqual({ valid: true });
    expect(runner.shaExists).toHaveBeenCalledTimes(1);
    expect(runner.isAncestor).toHaveBeenCalledTimes(1);
    expect(runner.fetchOriginSha).not.toHaveBeenCalled();
  });

  it("retries after fetch when ancestor check fails then succeeds", async () => {
    const isAncestor = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const runner = mockRunner({ isAncestor });
    await expect(validateSinceSha(SINCE, HEAD, CWD, runner)).resolves.toEqual({ valid: true });
    expect(runner.fetchOriginSha).toHaveBeenCalledWith(SINCE, CWD);
    expect(runner.fetchDeepen).toHaveBeenCalledWith(CWD);
    expect(isAncestor).toHaveBeenCalledTimes(2);
  });

  it("returns invalid when sha is missing after fetch retry", async () => {
    const runner = mockRunner({
      shaExists: vi.fn().mockResolvedValue(false),
    });
    const result = await validateSinceSha(SINCE, HEAD, CWD, runner);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("since-sha-not-found");
    expect(runner.fetchOriginSha).toHaveBeenCalled();
  });

  it("returns invalid when sha exists but is not an ancestor after retry", async () => {
    const runner = mockRunner({
      isAncestor: vi.fn().mockResolvedValue(false),
    });
    const result = await validateSinceSha(SINCE, HEAD, CWD, runner);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("since-sha-not-ancestor");
  });
});

describe("resolveReviewMode", () => {
  it("uses full mode when tracking is absent", async () => {
    const result = await resolveReviewMode({ tracking: null, head: HEAD, cwd: CWD });
    expect(result).toEqual({ mode: "full", reason: "no-tracking" });
  });

  it("uses incremental mode when tracking sha is valid", async () => {
    const runner = mockRunner();
    const result = await resolveReviewMode({
      tracking: tracking(SINCE),
      head: HEAD,
      cwd: CWD,
      runner,
    });
    expect(result).toEqual({ mode: "incremental", sinceCommit: SINCE });
  });

  it("falls back to full when since sha is invalid", async () => {
    const runner = mockRunner({
      isAncestor: vi.fn().mockResolvedValue(false),
    });
    const result = await resolveReviewMode({
      tracking: tracking(SINCE),
      head: HEAD,
      cwd: CWD,
      runner,
    });
    expect(result.mode).toBe("full");
    expect(result.sinceCommit).toBeUndefined();
    expect(result.reason).toBe("since-sha-not-ancestor");
  });
});

describe("intersectFiles", () => {
  it("keeps only paths present in both pr and incremental sets", () => {
    expect(intersectFiles(["a.ts", "b.ts", "c.ts"], ["b.ts", "d.ts"])).toEqual(["b.ts"]);
  });
});

describe("applyReviewPackageScope", () => {
  it("filters paths when review.config.json is present", async () => {
    const dir = await mkdtemp(join(tmpdir(), "review-scope-"));
    try {
      await mkdir(join(dir, ".ai-code-review"), { recursive: true });
      await writeFile(
        join(dir, REVIEW_CONFIG_RELATIVE),
        JSON.stringify({ reviewPackages: ["packages/reviewer-runner"] }),
        "utf8",
      );
      const scoped = await applyReviewPackageScope(
        ["packages/reviewer-runner/a.ts", "packages/ledger-lite/b.ts"],
        dir,
      );
      expect(scoped).toEqual(["packages/reviewer-runner/a.ts"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("computeEffectiveScope", () => {
  it("intersects pr and incremental files in incremental mode", async () => {
    const runner = mockRunner({
      listPrFiles: vi.fn().mockResolvedValue(["a.ts", "b.ts"]),
      listIncrementalFiles: vi.fn().mockResolvedValue(["b.ts", "c.ts"]),
    });
    const scope = await computeEffectiveScope({
      mode: "incremental",
      sinceCommit: SINCE,
      base: "base",
      head: HEAD,
      cwd: CWD,
      runner,
    });
    expect(scope).toEqual({
      prFiles: ["a.ts", "b.ts"],
      incrementalFiles: ["b.ts", "c.ts"],
      effectiveFiles: ["b.ts"],
    });
  });

  it("uses pr files as effective scope in full mode", async () => {
    const runner = mockRunner({
      listPrFiles: vi.fn().mockResolvedValue(["a.ts"]),
    });
    const scope = await computeEffectiveScope({
      mode: "full",
      base: "base",
      head: HEAD,
      cwd: CWD,
      runner,
    });
    expect(scope.effectiveFiles).toEqual(["a.ts"]);
  });
});

describe("shouldSkipAgent", () => {
  it("skips with pure-sync when first-parent log is empty and effective scope is empty", async () => {
    const runner = mockRunner({
      firstParentLog: vi.fn().mockResolvedValue(""),
      listPrFiles: vi.fn().mockResolvedValue([]),
      listIncrementalFiles: vi.fn().mockResolvedValue([]),
    });
    const result = await shouldSkipAgent({
      mode: "incremental",
      sinceCommit: SINCE,
      base: "base",
      head: HEAD,
      cwd: CWD,
      runner,
    });
    expect(result).toMatchObject({ skip: true, reason: "pure-sync" });
  });

  it("does not pure-sync skip when effective files exist despite empty first-parent log", async () => {
    const runner = mockRunner({
      firstParentLog: vi.fn().mockResolvedValue(""),
      listPrFiles: vi.fn().mockResolvedValue(["a.ts"]),
      listIncrementalFiles: vi.fn().mockResolvedValue(["a.ts"]),
    });
    const result = await shouldSkipAgent({
      mode: "incremental",
      sinceCommit: SINCE,
      base: "base",
      head: HEAD,
      cwd: CWD,
      runner,
    });
    expect(result.skip).toBe(false);
  });

  it("skips with empty-effective-scope when intersection is empty", async () => {
    const runner = mockRunner({
      listPrFiles: vi.fn().mockResolvedValue(["a.ts"]),
      listIncrementalFiles: vi.fn().mockResolvedValue(["b.ts"]),
      firstParentLog: vi.fn().mockResolvedValue("abc feat\n"),
    });
    const result = await shouldSkipAgent({
      mode: "incremental",
      sinceCommit: SINCE,
      base: "base",
      head: HEAD,
      cwd: CWD,
      runner,
    });
    expect(result).toMatchObject({ skip: true, reason: "empty-effective-scope" });
  });

  it("does not skip when effective files exist", async () => {
    const runner = mockRunner();
    const result = await shouldSkipAgent({
      mode: "incremental",
      sinceCommit: SINCE,
      base: "base",
      head: HEAD,
      cwd: CWD,
      runner,
    });
    expect(result.skip).toBe(false);
    expect(result.effectiveFiles.length).toBeGreaterThan(0);
  });
});

describe("writePrFilesList", () => {
  it("writes newline-separated paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pr-files-"));
    const filePath = join(dir, "pr-files.txt");
    try {
      await writePrFilesList(["src/a.ts", "src/b.ts"], filePath);
      expect(await readFile(filePath, "utf8")).toBe("src/a.ts\nsrc/b.ts\n");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("logReviewMode", () => {
  it("is a no-op (scope logged via orchestrator and summary)", () => {
    expect(() => logReviewMode({ mode: "incremental", sinceCommit: SINCE })).not.toThrow();
    expect(() => logReviewMode({ mode: "full", reason: "no-tracking" })).not.toThrow();
  });
});

describe("logReviewScope", () => {
  it("is a no-op", () => {
    expect(() =>
      logReviewScope("incremental", {
        prFiles: ["a.ts", "b.ts"],
        incrementalFiles: ["a.ts"],
        effectiveFiles: ["a.ts"],
      }),
    ).not.toThrow();
  });
});
