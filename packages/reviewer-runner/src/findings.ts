import { readFile } from "node:fs/promises";

export type AnalyzerKey = "security" | "performance";

export type Severity = "critical" | "major" | "minor" | "enhancement";

export interface Finding {
  analyzer: AnalyzerKey;
  severity: Severity;
  file: string;
  line?: number;
  issue: string;
  suggestion: string;
}

export interface FindingsReport {
  version: "2";
  findings: Finding[];
}

const SEVERITIES = new Set<Severity>(["critical", "major", "minor", "enhancement"]);
const ANALYZERS = new Set<AnalyzerKey>(["security", "performance"]);

export function parseFindingsJson(text: string): FindingsReport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Findings file is not valid JSON");
  }
  return validateFindingsReport(data);
}

export async function parseFindingsFile(path: string): Promise<FindingsReport> {
  const text = await readFile(path, "utf8");
  return parseFindingsJson(text);
}

export function validateFindingsReport(data: unknown): FindingsReport {
  if (!data || typeof data !== "object") {
    throw new Error("Findings report must be an object");
  }
  const record = data as Record<string, unknown>;
  if (record.version === "1") {
    throw new Error('Findings report version "1" is no longer supported; use version "2"');
  }
  if (record.version !== "2") {
    throw new Error('Findings report version must be "2"');
  }
  if (!Array.isArray(record.findings)) {
    throw new Error("Findings report must include findings array");
  }
  const findings: Finding[] = [];
  for (const item of record.findings) {
    findings.push(validateFinding(item));
  }
  return { version: "2", findings };
}

function validateFinding(item: unknown): Finding {
  if (!item || typeof item !== "object") {
    throw new Error("Each finding must be an object");
  }
  const f = item as Record<string, unknown>;
  const analyzer = f.analyzer;
  if (typeof analyzer !== "string" || !ANALYZERS.has(analyzer as AnalyzerKey)) {
    throw new Error('Finding analyzer must be "security" or "performance"');
  }
  if (typeof f.issue !== "string" || f.issue.trim() === "") {
    throw new Error("Finding must include a non-empty issue string");
  }
  if (typeof f.suggestion !== "string" || f.suggestion.trim() === "") {
    throw new Error("Finding must include a non-empty suggestion string");
  }
  if (typeof f.file !== "string") {
    throw new Error("Finding must include file string");
  }
  const severity = f.severity;
  if (typeof severity !== "string" || !SEVERITIES.has(severity as Severity)) {
    throw new Error(
      "Finding severity must be critical, major, minor, or enhancement",
    );
  }
  const finding: Finding = {
    analyzer: analyzer as AnalyzerKey,
    severity: severity as Severity,
    file: f.file,
    issue: f.issue,
    suggestion: f.suggestion,
  };
  if (f.line !== undefined) {
    if (typeof f.line !== "number" || !Number.isInteger(f.line) || f.line < 1) {
      throw new Error("Finding line must be a positive integer");
    }
    finding.line = f.line;
  }
  return finding;
}
