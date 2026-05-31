import type { CaseRunResult } from "./run-case.js";

export type EvalRunSummary = {
  total: number;
  passed: number;
  failed: number;
  totalDurationMs: number;
  retries: number;
  judgeUsed: number;
  bySuite: Record<
    string,
    { total: number; passed: number; durationMs: number }
  >;
};

export function buildEvalRunSummary(results: CaseRunResult[]): EvalRunSummary {
  const bySuite: EvalRunSummary["bySuite"] = {};
  let totalDurationMs = 0;
  let retries = 0;
  let judgeUsed = 0;

  for (const result of results) {
    totalDurationMs += result.durationMs;
    if (result.retry) retries += 1;
    if (result.judgeUsed) judgeUsed += 1;

    const bucket = bySuite[result.suite] ?? {
      total: 0,
      passed: 0,
      durationMs: 0,
    };
    bucket.total += 1;
    if (result.pass) bucket.passed += 1;
    bucket.durationMs += result.durationMs;
    bySuite[result.suite] = bucket;
  }

  const passed = results.filter((r) => r.pass).length;

  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    totalDurationMs,
    retries,
    judgeUsed,
    bySuite,
  };
}

export function formatEvalRunSummary(summary: EvalRunSummary): string {
  const lines: string[] = [
    `passed ${summary.passed}/${summary.total}`,
    `duration ${(summary.totalDurationMs / 1000).toFixed(1)}s`,
    `retries ${summary.retries}`,
    `judge ${summary.judgeUsed}/${summary.total}`,
  ];

  const suites = Object.keys(summary.bySuite).sort();
  if (suites.length > 0) {
    lines.push("", "By suite:");
    for (const suite of suites) {
      const bucket = summary.bySuite[suite]!;
      lines.push(
        `  ${suite}: ${bucket.passed}/${bucket.total} (${(bucket.durationMs / 1000).toFixed(1)}s)`,
      );
    }
  }

  return lines.join("\n");
}
