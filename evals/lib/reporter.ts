import type { DiscoveredCase } from "./discover-cases.js";
import type { CaseRunResult } from "./run-case.js";
import type { EvalRunSummary } from "./summary.js";
import {
  bold,
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
    this.renderCaseUpdate(suite, caseId);

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
    this.renderCaseUpdate(result.suite, result.caseId);

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
      if (this.runningKey) {
        const { suite, caseId } = parseCaseKey(this.runningKey);
        this.renderCaseUpdate(suite, caseId);
      }
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
    this.writeTreeBlock(lines);
  }

  private renderCaseUpdate(suite: string, caseId: string): void {
    if (!this.isTTY) {
      this.writeRawLine(this.formatCaseLine(suite, caseId));
      const result = this.results.get(caseKey(suite, caseId));
      if (result?.error) {
        this.writeRawLine(`      ${result.error}`);
      }
      return;
    }

    this.renderTree();
  }

  private buildTreeLines(): string[] {
    const lines: string[] = [];

    for (const group of this.groups) {
      lines.push(this.formatSuiteLine(group.suite));
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

  private formatSuiteLine(suite: string): string {
    const label = `${suite}:`;
    return this.useColor ? `  ${bold(label, true)}` : `  ${label}`;
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

  /** Header/summary lines — never reuse tree redraw helpers. */
  private writeLine(line: string): void {
    this.writeRawLine(line);
  }

  private writeRawLine(line: string): void {
    this.output.write(`${line}\n`);
  }

  private writeTreeBlock(lines: string[]): void {
    if (lines.length === 0) {
      this.treeLineCount = 0;
      return;
    }

    if (this.isTTY) {
      if (this.treeLineCount > 0) {
        this.output.write(`\x1b[${this.treeLineCount}A`);
      }
      this.output.write(
        lines.map((line) => `\x1b[2K\r${line}`).join("\n") + "\n",
      );
    } else {
      for (const line of lines) {
        this.writeRawLine(line);
      }
    }

    this.treeLineCount = lines.length;
  }
}

function parseCaseKey(key: CaseKey): { suite: string; caseId: string } {
  const slash = key.indexOf("/");
  return {
    suite: key.slice(0, slash),
    caseId: key.slice(slash + 1),
  };
}
