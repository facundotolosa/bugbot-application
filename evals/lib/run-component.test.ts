import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { PATHS } from "./invocation.js";
import {
  readAnalyzerOutput,
  runAnalyzerHarness,
  validateAnalyzerOutputText,
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
