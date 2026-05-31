import type { FindingsReport, Finding } from "./findings.js";
import type { KnownIssue } from "../github/github.js";

export interface KnownIssuesJson {
  issues: KnownIssue[];
}

export function buildKnownIssuesJson(
  inlineComments: readonly KnownIssue[],
): KnownIssuesJson {
  return {
    issues: inlineComments.map((issue) => ({
      file: issue.file,
      line: issue.line,
      message: issue.message,
    })),
  };
}

export interface FilterFindingsResult {
  findings: Finding[];
  droppedOutOfPr: number;
}

export function filterFindingsForPost(
  report: FindingsReport,
  prFiles: ReadonlySet<string>,
): FilterFindingsResult {
  const findings = report.findings.filter((finding) => prFiles.has(finding.file));
  return {
    findings,
    droppedOutOfPr: report.findings.length - findings.length,
  };
}
