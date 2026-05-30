import { readFile } from "node:fs/promises";

export type Severity = "info" | "warning" | "error";

export interface Finding {
  severity: Severity;
  file: string;
  line?: number;
  problem: string;
  suggestion: string;
}

export interface FindingsReport {
  version: "1";
  findings: Finding[];
}

const SEVERITIES = new Set<Severity>(["info", "warning", "error"]);

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
  if (record.version !== "1") {
    throw new Error('Findings report version must be "1"');
  }
  if (!Array.isArray(record.findings)) {
    throw new Error("Findings report must include findings array");
  }
  const findings: Finding[] = [];
  for (const item of record.findings) {
    findings.push(validateFinding(item));
  }
  return { version: "1", findings };
}

function validateFinding(item: unknown): Finding {
  if (!item || typeof item !== "object") {
    throw new Error("Each finding must be an object");
  }
  const f = item as Record<string, unknown>;
  if (typeof f.problem !== "string" || typeof f.suggestion !== "string") {
    throw new Error("Finding must include problem and suggestion strings");
  }
  if (typeof f.file !== "string") {
    throw new Error("Finding must include file string");
  }
  const severity = f.severity;
  if (typeof severity !== "string" || !SEVERITIES.has(severity as Severity)) {
    throw new Error("Finding severity must be info, warning, or error");
  }
  const finding: Finding = {
    severity: severity as Severity,
    file: f.file,
    problem: f.problem,
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
