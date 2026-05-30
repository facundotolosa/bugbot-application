import type {
  AnalyzerKey,
  Finding,
  FindingsReport,
  Severity,
} from "../../../../packages/reviewer-runner/src/findings.js";

export type { AnalyzerKey };

export interface AnalyzerFinding {
  severity: Severity;
  file: string;
  line?: number;
  issue: string;
  suggestion: string;
  category?: string;
}

export interface AnalyzerOutput {
  analyzer: AnalyzerKey;
  findings: AnalyzerFinding[];
}

const SEVERITIES = new Set<Severity>(["critical", "major", "minor", "enhancement"]);
const ANALYZERS = new Set<AnalyzerKey>(["security", "performance"]);

function validateIntermediateFinding(
  item: AnalyzerFinding,
  analyzer: AnalyzerKey,
): Finding {
  if (!ANALYZERS.has(analyzer)) {
    throw new Error('Analyzer output analyzer must be "security" or "performance"');
  }
  if (typeof item.issue !== "string" || item.issue.trim() === "") {
    throw new Error("Finding must include a non-empty issue string");
  }
  if (typeof item.suggestion !== "string" || item.suggestion.trim() === "") {
    throw new Error("Finding must include a non-empty suggestion string");
  }
  if (typeof item.file !== "string") {
    throw new Error("Finding must include file string");
  }
  if (!SEVERITIES.has(item.severity)) {
    throw new Error(
      "Finding severity must be critical, major, minor, or enhancement",
    );
  }
  const finding: Finding = {
    analyzer,
    severity: item.severity,
    file: item.file,
    issue: item.issue,
    suggestion: item.suggestion,
  };
  if (item.line !== undefined) {
    if (typeof item.line !== "number" || !Number.isInteger(item.line) || item.line < 1) {
      throw new Error("Finding line must be a positive integer");
    }
    finding.line = item.line;
  }
  return finding;
}

export function mergeAnalyzerOutputs(outputs: AnalyzerOutput[]): FindingsReport {
  const findings: Finding[] = [];
  for (const output of outputs) {
    const analyzer = output.analyzer;
    const items = output.findings ?? [];
    for (const item of items) {
      findings.push(validateIntermediateFinding(item, analyzer));
    }
  }
  return { version: "2", findings };
}
