import type { DiscoveredCase } from "./discover-cases.js";
import type { CaseRunResult } from "./run-case.js";
import type { EvalRunSummary } from "./summary.js";
import {
  green,
  red,
  shouldUseColor,
} from "../../packages/reviewer-runner/src/support/logger.js";

type CaseState = "pending" | "running" | "passed" | "failed";

type CaseKey = `${string}/${string}`;

export type EvalReporterOptions = {
  output?: NodeJS.WriteStream;
  isTTY?: boolean;
  isCI?: boolean;
  useColor?: boolean;
};

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function caseKey(suite: string, caseId: string): CaseKey {
  return `${suite}/${caseId}`;
}

function formatDuration(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatBadges(result: CaseRunResult): string {
  const parts: string[] = [];
  if (result.retry) parts.push("retry=yes");
  if (result.judgeUsed) parts.push("judge=yes");
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

function groupBySuite(
  cases: DiscoveredCase[],
): { suite: string; cases: DiscoveredCase[] }[] {
  const groups: { suite: string; cases: DiscoveredCase[] }[] = [];
  const indexBySuite = new Map<string, number>();

  for (const discovered of cases) {
    let idx = indexBySuite.get(discovered.suite);
    if (idx === undefined) {
      idx = groups.length;
      indexBySuite.set(discovered.suite, idx);
      groups.push({ suite: discovered.suite, cases: [] });
    }
    groups[idx]!.cases.push(discovered);
  }

  return groups;
}

export class EvalReporter {
  private verbose = false;
  private output: NodeJS.WriteStream;
  private isTTY: boolean;
  private isCI: boolean;
  private useColor: boolean;
  private groups: ReturnType<typeof groupBySuite> = [];
  private states = new Map<CaseKey, CaseState>();
  private results = new Map<CaseKey, CaseRunResult>();
  private runningKey: CaseKey | null = null;
  private spinnerFrame = 0;
  private spinnerTimer: ReturnType<typeof setInterval> | null = null;
  private treeLineCount = 0;

  constructor(options: EvalReporterOptions = {}) {
    this.output = options.output ?? process.stdout;
    this.isTTY = options.isTTY ?? this.output.isTTY === true;
    this.isCI = options.isCI ?? process.env.CI === "true";
    this.useColor =
      options.useColor ??
      shouldUseColor(process.env, this.isTTY);
  }

  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }

  startRun(runId: string, cases: DiscoveredCase[], refreshInputs = false): void {
    this.groups = groupBySuite(cases);

    for (const group of this.groups) {
      for (const discovered of group.cases) {
        this.states.set(caseKey(discovered.suite, discovered.caseId), "pending");
      }
    }

    this.writeLine(`Eval run ${runId} · ${cases.length} cases`);
    if (refreshInputs) {
      this.writeLine("Mode: --refresh-inputs enabled");
    }
    this.writeLine("");

    this.renderTree();
  }

  startCase(suite: string, caseId: string): void {
    const key = caseKey(suite, caseId);
    this.runningKey = key;
    this.states.set(key, "running");
    this.renderTree();

    if (this.isTTY && !this.isCI) {
      this.startSpinner();
    }
  }

  endCase(result: CaseRunResult): void {
    this.stopSpinner();
    const key = caseKey(result.suite, result.caseId);
    this.runningKey = null;
    this.states.set(key, result.pass ? "passed" : "failed");
    this.results.set(key, result);
    this.renderTree();

    if (this.verbose && result.taskPrompt) {
      this.printTaskPrompt(result.taskPrompt);
    }
  }

  printSummary(summary: EvalRunSummary, runId: string): void {
    this.writeLine("");
    this.writeLine("Summary");
    this.writeLine(
      `  Tests:  ${summary.passed} passed | ${summary.failed} failed | ${summary.total} total`,
    );
    this.writeLine(`  Time:   ${formatDuration(summary.totalDurationMs)}`);
    this.writeLine(
      `  Judge:  ${summary.judgeUsed}/${summary.total} · Retries: ${summary.retries}`,
    );

    const suites = Object.keys(summary.bySuite);
    if (suites.length > 0) {
      this.writeLine("");
      this.writeLine("  By suite:");
      for (const suite of suites) {
        const bucket = summary.bySuite[suite]!;
        const label = suite.padEnd(22);
        this.writeLine(`    ${label}${bucket.passed}/${bucket.total}`);
      }
    }

    this.writeLine("");
    this.writeLine(`Artifacts: evals/out/${runId}/`);
  }

  printTaskPrompt(taskPrompt: string): void {
    const lineCount = taskPrompt.split("\n").length;
    this.writeLine(`  Task prompt (${lineCount} lines):`);
    for (const line of taskPrompt.split("\n")) {
      this.writeLine(`    ${line}`);
    }
  }

  private startSpinner(): void {
    this.stopSpinner();
    this.spinnerTimer = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % SPINNER_FRAMES.length;
      this.renderTree();
    }, 80);
  }

  private stopSpinner(): void {
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
    }
  }

  private renderTree(): void {
    const lines = this.buildTreeLines();

    if (this.isTTY && this.treeLineCount > 0) {
      this.moveCursorUp(this.treeLineCount);
    }

    for (const line of lines) {
      this.writeLine(line);
    }

    this.treeLineCount = lines.length;
  }

  private buildTreeLines(): string[] {
    const lines: string[] = [];

    for (const group of this.groups) {
      lines.push(`  ${group.suite}`);
      for (const discovered of group.cases) {
        lines.push(this.formatCaseLine(discovered.suite, discovered.caseId));
        const result = this.results.get(caseKey(discovered.suite, discovered.caseId));
        if (result?.error) {
          lines.push(`      ${result.error}`);
        }
      }
    }

    return lines;
  }

  private formatCaseLine(suite: string, caseId: string): string {
    const key = caseKey(suite, caseId);
    const state = this.states.get(key) ?? "pending";
    const result = this.results.get(key);
    const indent = "    ";

    if (state === "pending") {
      return `${indent}○ ${caseId}`;
    }

    if (state === "running") {
      const marker = this.runningIndicator();
      return `${indent}${marker} ${caseId} …`;
    }

    const duration = result
      ? ` (${formatDuration(result.durationMs)})${formatBadges(result)}`
      : "";
    if (state === "passed") {
      const glyph = this.useColor ? green("✓", true) : "✓";
      return `${indent}${glyph} ${caseId}${duration}`;
    }

    const glyph = this.useColor ? red("✗", true) : "✗";
    return `${indent}${glyph} ${caseId}${duration}`;
  }

  private runningIndicator(): string {
    if (this.isTTY && !this.isCI) {
      return SPINNER_FRAMES[this.spinnerFrame] ?? "…";
    }
    return "…";
  }

  private moveCursorUp(count: number): void {
    this.output.write(`\x1b[${count}A`);
  }

  private writeLine(line: string): void {
    if (this.isTTY && this.treeLineCount > 0) {
      this.output.write("\x1b[2K\r");
    }
    this.output.write(`${line}\n`);
  }

}
