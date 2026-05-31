import { describe, expect, it } from "vitest";

import { buildEvalRunSummary, formatEvalRunSummary } from "./summary.js";
import type { CaseRunResult } from "./run-case.js";

describe("eval run summary", () => {
  it("aggregates pass/fail, duration, retry, and suite buckets", () => {
    const results: CaseRunResult[] = [
      {
        suite: "analyzer-security",
        caseId: "a",
        pass: true,
        durationMs: 1000,
        retry: false,
        judgeUsed: true,
      },
      {
        suite: "analyzer-security",
        caseId: "b",
        pass: false,
        durationMs: 2000,
        retry: true,
        judgeUsed: true,
      },
      {
        suite: "validator",
        caseId: "c",
        pass: true,
        durationMs: 500,
        retry: false,
        judgeUsed: true,
      },
    ];

    const summary = buildEvalRunSummary(results);
    expect(summary.passed).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.retries).toBe(1);
    expect(summary.bySuite["analyzer-security"]).toEqual({
      total: 2,
      passed: 1,
      durationMs: 3000,
    });

    const text = formatEvalRunSummary(summary);
    expect(text).toContain("passed 2/3");
    expect(text).toContain("analyzer-security: 1/2");
  });
});
