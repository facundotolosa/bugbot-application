import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createReviewRunDir } from "../../packages/reviewer-runner/src/paths/review-run-dir.js";
import { securityTaskPrompt, validatorTaskPrompt } from "./invocation.js";
import { createEvalSession } from "./session.js";
import {
  readAnalyzerOutput,
  runAnalyzerHarness,
  runValidatorHarness,
  validateAnalyzerOutputText,
  validateValidatorOutputText,
} from "./run-component.js";

describe("runAnalyzerHarness", () => {
  const cleanups: (() => Promise<void>)[] = [];

  afterEach(async () => {
    await Promise.all(cleanups.map((fn) => fn()));
    cleanups.length = 0;
  });

  it("dryRun validates existing analyzer output without Agent", async () => {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const cwd = await mkdtemp(join(tmpdir(), "eval-component-"));
    const session = await createEvalSession();
    cleanups.push(async () => {
      await session.cleanup();
      const { rm } = await import("node:fs/promises");
      await rm(cwd, { recursive: true, force: true });
    });

    await writeFile(
      session.manifest.security,
      JSON.stringify({
        analyzer: "security",
        findings: [
          {
            severity: "major",
            file: "src/auth.ts",
            line: 2,
            issue: "Hardcoded secret",
            suggestion: "Use env var",
          },
        ],
      }),
      "utf8",
    );

    const result = await runAnalyzerHarness({
      cwd,
      analyzer: "security",
      apiKey: "test-key",
      dryRun: true,
    });

    expect(result.retry).toBe(false);
    expect(result.taskPrompt).toBe(securityTaskPrompt(session.sessionDir));
    expect(await readAnalyzerOutput(cwd, "security")).toContain("Hardcoded");
  });

  it("validateAnalyzerOutputText rejects invalid JSON", () => {
    expect(() => validateAnalyzerOutputText("{", "security")).toThrow(/JSON/i);
  });
});

describe("runValidatorHarness", () => {
  const cleanups: (() => Promise<void>)[] = [];

  afterEach(async () => {
    await Promise.all(cleanups.map((fn) => fn()));
    cleanups.length = 0;
  });

  it("dryRun accepts valid validator-output.json with no retry", async () => {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const cwd = await mkdtemp(join(tmpdir(), "eval-validator-"));
    const reviewRunDir = await createReviewRunDir(cwd, new Date("2026-05-31T12:00:00.000Z"));
    await writeFile(join(reviewRunDir, "known-issues.json"), JSON.stringify({ issues: [] }), "utf8");
    const session = await createEvalSession();
    cleanups.push(async () => {
      await session.cleanup();
      const { rm } = await import("node:fs/promises");
      await rm(cwd, { recursive: true, force: true });
    });

    await writeFile(
      session.manifest.validatorOut,
      JSON.stringify({
        findings: [
          {
            analyzer: "security",
            severity: "major",
            file: "src/auth.ts",
            line: 2,
            issue: "Hardcoded token",
            suggestion: "Use secret store",
          },
        ],
        filter_summary: {
          raw_input: 3,
          after_exact_dedup: 2,
          after_root_cause_dedup: 1,
          after_dedup: 1,
          after_fp_filters: 1,
          after_known_issues: 1,
          after_verification: 1,
          final_output: 1,
        },
      }),
      "utf8",
    );

    const result = await runValidatorHarness({
      cwd,
      reviewRunDir,
      apiKey: "test-key",
      dryRun: true,
    });

    expect(result.retry).toBe(false);
    expect(result.taskPrompt).toBe(
      validatorTaskPrompt(session.sessionDir, join(reviewRunDir, "known-issues.json")),
    );
    expect(result.taskPrompt.split("\n")).toHaveLength(3);
    expect(result.filterSummary.final_output).toBe(1);
  });

  it("fails without retry when validator output is missing", async () => {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const cwd = await mkdtemp(join(tmpdir(), "eval-validator-missing-"));
    const session = await createEvalSession();
    cleanups.push(async () => {
      await session.cleanup();
      const { rm } = await import("node:fs/promises");
      await rm(cwd, { recursive: true, force: true });
    });

    await expect(
      runValidatorHarness({
        cwd,
        reviewRunDir: await createReviewRunDir(cwd),
        apiKey: "test-key",
        dryRun: true,
      }),
    ).rejects.toThrow(/no retry/i);
  });

  it("validateValidatorOutputText rejects invalid JSON", () => {
    expect(() => validateValidatorOutputText("{")).toThrow(/JSON/i);
  });
});
