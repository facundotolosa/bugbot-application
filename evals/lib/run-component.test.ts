import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { PATHS, validatorTaskPrompt } from "./invocation.js";
import {
  readAnalyzerOutput,
  runAnalyzerHarness,
  runValidatorHarness,
  validateAnalyzerOutputText,
  validateValidatorOutputText,
} from "./run-component.js";

describe("runAnalyzerHarness", () => {
  const cleanups: string[] = [];

  afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await Promise.all(
      cleanups.map((dir) => rm(dir, { recursive: true, force: true })),
    );
    cleanups.length = 0;
  });

  it("dryRun validates existing analyzer output without Agent", async () => {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const cwd = await mkdtemp(join(tmpdir(), "eval-component-"));
    cleanups.push(cwd);

    await mkdir(join(cwd, ".ai-code-review/work"), { recursive: true });
    await writeFile(
      join(cwd, PATHS.securityFindings),
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
    expect(result.taskPrompt).toBe(
      "Read diff from: .ai-code-review/work/diff.json\nWrite findings to: .ai-code-review/work/security-findings.json",
    );
    expect(await readAnalyzerOutput(cwd, "security")).toContain("Hardcoded");
  });

  it("validateAnalyzerOutputText rejects invalid JSON", () => {
    expect(() => validateAnalyzerOutputText("{", "security")).toThrow(/JSON/i);
  });
});

describe("runValidatorHarness", () => {
  const cleanups: string[] = [];

  afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await Promise.all(
      cleanups.map((dir) => rm(dir, { recursive: true, force: true })),
    );
    cleanups.length = 0;
  });

  it("dryRun accepts valid validator-output.json with no retry", async () => {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const cwd = await mkdtemp(join(tmpdir(), "eval-validator-"));
    cleanups.push(cwd);

    await mkdir(join(cwd, ".ai-code-review/work"), { recursive: true });
    await writeFile(
      join(cwd, PATHS.validatorOutput),
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
      apiKey: "test-key",
      dryRun: true,
    });

    expect(result.retry).toBe(false);
    expect(result.taskPrompt).toBe(validatorTaskPrompt());
    expect(result.taskPrompt.split("\n")).toHaveLength(3);
    expect(result.filterSummary.final_output).toBe(1);
  });

  it("fails without retry when validator output is missing", async () => {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const cwd = await mkdtemp(join(tmpdir(), "eval-validator-missing-"));
    cleanups.push(cwd);

    await expect(
      runValidatorHarness({ cwd, apiKey: "test-key", dryRun: true }),
    ).rejects.toThrow(/no retry/i);
  });

  it("validateValidatorOutputText rejects invalid JSON", () => {
    expect(() => validateValidatorOutputText("{")).toThrow(/JSON/i);
  });
});
