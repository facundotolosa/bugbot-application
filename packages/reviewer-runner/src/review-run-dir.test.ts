import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createReviewRunDir,
  findingsReportRelativePath,
  formatReviewRunTimestamp,
  reviewRunRelativeDir,
} from "./review-run-dir.js";

describe("review-run-dir", () => {
  it("formats timestamps without colons or dots", () => {
    const ts = formatReviewRunTimestamp(new Date("2026-05-31T14:30:00.123Z"));
    expect(ts).toBe("2026-05-31T14-30-00-123Z");
    expect(ts).not.toContain(":");
    expect(ts).not.toContain(".");
  });

  it("creates a timestamped directory under .ai-code-review", async () => {
    const repo = await mkdtemp(join(tmpdir(), "repo-"));
    try {
      const fixed = new Date("2026-05-31T12:00:00.000Z");
      const runDir = await createReviewRunDir(repo, fixed);
      expect(runDir).toBe(join(repo, reviewRunRelativeDir(fixed)));
      expect(findingsReportRelativePath(runDir, repo)).toBe(
        ".ai-code-review/2026-05-31T12-00-00-000Z/findings.json",
      );
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});
