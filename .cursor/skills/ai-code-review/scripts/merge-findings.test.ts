import { describe, expect, it } from "vitest";
import { parseFindingsJson } from "../../../../packages/reviewer-runner/src/findings.js";
import { mergeAnalyzerOutputs } from "./merge-findings.js";

describe("mergeAnalyzerOutputs", () => {
  it("merges security-only output with matching count", () => {
    const merged = mergeAnalyzerOutputs([
      {
        analyzer: "security",
        findings: [
          {
            severity: "major",
            file: "src/a.ts",
            line: 1,
            issue: "issue one",
            suggestion: "fix one",
          },
          {
            severity: "minor",
            file: "src/b.ts",
            line: 2,
            issue: "issue two",
            suggestion: "fix two",
          },
        ],
      },
    ]);
    expect(merged.findings).toHaveLength(2);
    expect(merged.findings.every((f) => f.analyzer === "security")).toBe(true);
    expect(parseFindingsJson(JSON.stringify(merged))).toEqual(merged);
  });

  it("concatenates security then performance when inputs are ordered that way", () => {
    const merged = mergeAnalyzerOutputs([
      {
        analyzer: "security",
        findings: [
          {
            severity: "critical",
            file: "src/a.ts",
            line: 1,
            issue: "sec",
            suggestion: "fix sec",
          },
        ],
      },
      {
        analyzer: "performance",
        findings: [
          {
            severity: "minor",
            file: "src/b.ts",
            line: 2,
            issue: "perf",
            suggestion: "fix perf",
          },
        ],
      },
    ]);
    expect(merged.findings.map((f) => f.analyzer)).toEqual([
      "security",
      "performance",
    ]);
    expect(parseFindingsJson(JSON.stringify(merged))).toEqual(merged);
  });

  it("retains duplicate file-line pairs across analyzers", () => {
    const merged = mergeAnalyzerOutputs([
      {
        analyzer: "security",
        findings: [
          {
            severity: "major",
            file: "src/shared.ts",
            line: 10,
            issue: "security view",
            suggestion: "sec fix",
          },
        ],
      },
      {
        analyzer: "performance",
        findings: [
          {
            severity: "minor",
            file: "src/shared.ts",
            line: 10,
            issue: "performance view",
            suggestion: "perf fix",
          },
        ],
      },
    ]);
    expect(merged.findings).toHaveLength(2);
    expect(merged.findings[0].issue).toBe("security view");
    expect(merged.findings[1].issue).toBe("performance view");
  });

  it("treats empty findings as no contributions", () => {
    const merged = mergeAnalyzerOutputs([
      { analyzer: "security", findings: [] },
      {
        analyzer: "performance",
        findings: [
          {
            severity: "enhancement",
            file: "src/c.ts",
            line: 3,
            issue: "only perf",
            suggestion: "optimize",
          },
        ],
      },
    ]);
    expect(merged.findings).toHaveLength(1);
    expect(merged.findings[0].analyzer).toBe("performance");
  });

  it("drops category from merged findings", () => {
    const merged = mergeAnalyzerOutputs([
      {
        analyzer: "security",
        findings: [
          {
            severity: "major",
            file: "src/a.ts",
            line: 1,
            issue: "xss",
            suggestion: "sanitize",
            category: "XSS",
          },
        ],
      },
    ]);
    expect(merged.findings[0]).not.toHaveProperty("category");
  });

  it("throws on invalid severity", () => {
    expect(() =>
      mergeAnalyzerOutputs([
        {
          analyzer: "security",
          findings: [
            {
              severity: "error" as "major",
              file: "src/a.ts",
              line: 1,
              issue: "bad",
              suggestion: "fix",
            },
          ],
        },
      ]),
    ).toThrow(/severity/);
  });
});
