import { afterEach, describe, expect, it, vi } from "vitest";

import type { DiscoveredCase } from "./discover-cases.js";
import type { CaseRunResult } from "./run-case.js";
import { EvalReporter } from "./reporter.js";
import { buildEvalRunSummary } from "./summary.js";

function createCaptureStream(isTTY = false): {
  stream: NodeJS.WriteStream;
  text: () => string;
} {
  const chunks: string[] = [];
  const stream = {
    isTTY,
    write: (chunk: string) => {
      chunks.push(chunk);
      return true;
    },
  } as unknown as NodeJS.WriteStream;

  return { stream, text: () => chunks.join("") };
}

const CASES: DiscoveredCase[] = [
  { suite: "analyzer-security", caseId: "leaked-key", dir: "/cases/analyzer-security/leaked-key" },
  { suite: "e2e", caseId: "ledger-pipeline", dir: "/cases/e2e/ledger-pipeline" },
];

describe("EvalReporter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prints all pending rows at startRun before any endCase", () => {
    vi.stubEnv("NO_COLOR", "1");
    const { stream, text } = createCaptureStream();
    const reporter = new EvalReporter({ output: stream, isTTY: false, useColor: false });

    reporter.startRun("2026-05-31T12-00-00-000Z", CASES);

    const out = text();
    expect(out).toContain("Eval run 2026-05-31T12-00-00-000Z · 2 cases");
    expect(out).toContain("analyzer-security:");
    expect(out).toContain("○ leaked-key");
    expect(out).toContain("e2e");
    expect(out).toContain("○ ledger-pipeline");
    expect(out).not.toContain("✓");
    expect(out).not.toContain("✗");
  });

  it("endCase pass line includes duration and badges only when judgeUsed or retry", () => {
    vi.stubEnv("NO_COLOR", "1");
    const { stream, text } = createCaptureStream();
    const reporter = new EvalReporter({ output: stream, isTTY: false, useColor: false });

    reporter.startRun("run-1", [CASES[0]!]);
    reporter.startCase("analyzer-security", "leaked-key");
    reporter.endCase({
      suite: "analyzer-security",
      caseId: "leaked-key",
      pass: true,
      durationMs: 16200,
      retry: false,
      judgeUsed: true,
    });

    const out = text();
    expect(out).toContain("✓ leaked-key (16.2s) judge=yes");
    expect(out).not.toContain("retry=yes");
  });

  it("endCase fail prints exactly one indented error line", () => {
    vi.stubEnv("NO_COLOR", "1");
    const { stream, text } = createCaptureStream();
    const reporter = new EvalReporter({ output: stream, isTTY: false, useColor: false });

    reporter.startRun("run-1", [CASES[1]!]);
    reporter.startCase("e2e", "ledger-pipeline");
    reporter.endCase({
      suite: "e2e",
      caseId: "ledger-pipeline",
      pass: false,
      durationMs: 98100,
      retry: false,
      judgeUsed: true,
      error: "severity is minor while the rubric requires severity_min major",
    });

    const out = text();
    expect(out).toContain("✗ ledger-pipeline (98.1s) judge=yes");
    expect(out).toContain("      severity is minor while the rubric requires severity_min major");
    expect(out.match(/severity is minor/g)?.length).toBe(1);
  });

  it("printSummary matches Vitest-style layout", () => {
    vi.stubEnv("NO_COLOR", "1");
    const { stream, text } = createCaptureStream();
    const reporter = new EvalReporter({ output: stream, isTTY: false, useColor: false });

    const results: CaseRunResult[] = [
      {
        suite: "analyzer-security",
        caseId: "leaked-key",
        pass: true,
        durationMs: 1000,
        retry: false,
        judgeUsed: true,
      },
      {
        suite: "e2e",
        caseId: "ledger-pipeline",
        pass: false,
        durationMs: 2000,
        retry: true,
        judgeUsed: true,
      },
    ];
    const summary = buildEvalRunSummary(results);
    reporter.printSummary(summary, "2026-05-31T12-00-00-000Z");

    const out = text();
    expect(out).toContain("Summary");
    expect(out).toContain("Tests:  1 passed | 1 failed | 2 total");
    expect(out).toContain("Time:");
    expect(out).toContain("Judge:  2/2 · Retries: 1");
    expect(out).not.toContain("By suite:");
    expect(out).toContain("Artifacts: evals/out/2026-05-31T12-00-00-000Z/");
  });

  it("uses static running marker in CI even on TTY", () => {
    vi.stubEnv("NO_COLOR", "1");
    vi.stubEnv("CI", "true");
    const { stream, text } = createCaptureStream(true);
    const reporter = new EvalReporter({
      output: stream,
      isTTY: true,
      isCI: true,
      useColor: false,
    });

    reporter.startRun("run-1", [CASES[0]!]);
    reporter.startCase("analyzer-security", "leaked-key");

    const out = text();
    expect(out).toContain("… leaked-key …");
    expect(out).not.toMatch(/⠋|⠙|⠹/);
  });

  it("uses spinner frames on TTY when not CI", () => {
    vi.stubEnv("NO_COLOR", "1");
    vi.stubEnv("CI", "");
    const { stream, text } = createCaptureStream(true);
    const reporter = new EvalReporter({
      output: stream,
      isTTY: true,
      isCI: false,
      useColor: false,
    });

    reporter.startRun("run-1", [CASES[0]!]);
    reporter.startCase("analyzer-security", "leaked-key");

    const out = text();
    expect(out).toMatch(/⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/);
  });

  it("transitions pending to running to pass on same logical row on TTY", () => {
    vi.stubEnv("NO_COLOR", "1");
    const { stream, text } = createCaptureStream(true);
    const reporter = new EvalReporter({
      output: stream,
      isTTY: true,
      isCI: false,
      useColor: false,
    });

    reporter.startRun("run-1", [CASES[0]!]);
    reporter.startCase("analyzer-security", "leaked-key");
    reporter.endCase({
      suite: "analyzer-security",
      caseId: "leaked-key",
      pass: true,
      durationMs: 500,
      retry: false,
      judgeUsed: false,
    });

    const out = text();
    expect(out).toContain("○ leaked-key");
    expect(out).toContain("✓ leaked-key (0.5s)");
    expect(out).not.toContain("✗ leaked-key");
  });

  it("redraws the TTY tree in place with cursor-up on updates", () => {
    vi.stubEnv("NO_COLOR", "1");
    const { stream, text } = createCaptureStream(true);
    const reporter = new EvalReporter({
      output: stream,
      isTTY: true,
      isCI: false,
      useColor: false,
    });

    reporter.startRun("run-1", [CASES[0]!]);
    reporter.startCase("analyzer-security", "leaked-key");

    const out = text();
    expect(out).toMatch(/\x1b\[\d+A/);
    expect(out.match(/\x1b\[2K/g)?.length).toBeGreaterThan(1);
  });

  it("does not duplicate the pending tree on non-TTY updates", () => {
    vi.stubEnv("NO_COLOR", "1");
    const { stream, text } = createCaptureStream();
    const reporter = new EvalReporter({ output: stream, isTTY: false, useColor: false });

    reporter.startRun("run-1", CASES);
    reporter.startCase("analyzer-security", "leaked-key");
    reporter.endCase({
      suite: "analyzer-security",
      caseId: "leaked-key",
      pass: true,
      durationMs: 1000,
      retry: false,
      judgeUsed: true,
    });

    const out = text();
    expect(out.match(/analyzer-security:/g)?.length).toBe(1);
    expect(out).toContain("○ leaked-key");
    expect(out).toContain("✓ leaked-key (1.0s) judge=yes");
  });
});
