import type {
  AnalyzerKey,
  Finding,
  FindingsReport,
  Severity,
} from "../../../../packages/reviewer-runner/src/findings.js";

export interface FilterSummary {
  raw_input: number;
  after_exact_dedup: number;
  after_root_cause_dedup: number;
  after_dedup: number;
  after_fp_filters: number;
  after_known_issues: number;
  after_verification: number;
  final_output: number;
}

const FILTER_SUMMARY_KEYS: (keyof FilterSummary)[] = [
  "raw_input",
  "after_exact_dedup",
  "after_root_cause_dedup",
  "after_dedup",
  "after_fp_filters",
  "after_known_issues",
  "after_verification",
  "final_output",
];

const SEVERITIES = new Set<Severity>(["critical", "major", "minor", "enhancement"]);
const ANALYZERS = new Set<AnalyzerKey>(["security", "performance"]);

export interface ValidatorFinding extends Finding {
  emoji?: string;
}

export interface ValidatorOutput {
  findings: ValidatorFinding[];
  filter_summary: FilterSummary;
}

export function zeroedFilterSummary(): FilterSummary {
  return {
    raw_input: 0,
    after_exact_dedup: 0,
    after_root_cause_dedup: 0,
    after_dedup: 0,
    after_fp_filters: 0,
    after_known_issues: 0,
    after_verification: 0,
    final_output: 0,
  };
}

function validateValidatorFinding(item: unknown): ValidatorFinding {
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
  const finding: ValidatorFinding = {
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
  if (f.emoji !== undefined) {
    if (typeof f.emoji !== "string" || f.emoji.length === 0) {
      throw new Error("Finding emoji must be a non-empty string when present");
    }
    finding.emoji = f.emoji;
  }
  return finding;
}

function validateFilterSummary(value: unknown): FilterSummary {
  if (!value || typeof value !== "object") {
    throw new Error("Validator output must include filter_summary object");
  }
  const record = value as Record<string, unknown>;
  if ("after_ticket_crossref" in record) {
    throw new Error("filter_summary must not include after_ticket_crossref");
  }
  const summary = {} as FilterSummary;
  for (const key of FILTER_SUMMARY_KEYS) {
    const n = record[key];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) {
      throw new Error(`filter_summary.${key} must be a non-negative number`);
    }
    summary[key] = n;
  }
  const extra = Object.keys(record).filter(
    (k) => !FILTER_SUMMARY_KEYS.includes(k as keyof FilterSummary),
  );
  if (extra.length > 0) {
    throw new Error(`filter_summary has unknown keys: ${extra.join(", ")}`);
  }
  return summary;
}

export function parseValidatorOutput(data: unknown): ValidatorOutput {
  if (!data || typeof data !== "object") {
    throw new Error("Validator output must be an object");
  }
  const record = data as Record<string, unknown>;
  if (!Array.isArray(record.findings)) {
    throw new Error("Validator output must include findings array");
  }
  const findings = record.findings.map(validateValidatorFinding);
  const filter_summary = validateFilterSummary(record.filter_summary);
  return { findings, filter_summary };
}

export function mapValidatorToFindingsReport(output: ValidatorOutput): FindingsReport {
  const findings: Finding[] = output.findings.map(
    ({ analyzer, severity, file, line, issue, suggestion }) => ({
      analyzer,
      severity,
      file,
      ...(line !== undefined ? { line } : {}),
      issue,
      suggestion,
    }),
  );
  return { version: "2", findings };
}
