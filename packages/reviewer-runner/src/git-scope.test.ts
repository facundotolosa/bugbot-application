import { describe, expect, it, vi } from "vitest";
import type { FoundTrackingComment } from "./github.js";
import {
  type GitRunner,
  logReviewMode,
  resolveReviewMode,
  validateSinceSha,
} from "./git-scope.js";

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

describe("logReviewMode", () => {
  it("logs incremental mode with since sha", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    logReviewMode({ mode: "incremental", sinceCommit: SINCE });
    expect(logSpy).toHaveBeenCalledWith(`[review] mode=incremental since=${SINCE}`);
    logSpy.mockRestore();
  });

  it("logs full mode with optional reason", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    logReviewMode({ mode: "full", reason: "no-tracking" });
    expect(logSpy).toHaveBeenCalledWith("[review] mode=full (no-tracking)");
    logSpy.mockRestore();
  });
});
