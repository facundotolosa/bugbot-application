import type { FindingsReport, Finding } from "./findings.js";
import type { KnownIssue } from "./github.js";

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

export function filterFindingsForPost(
  report: FindingsReport,
  prFiles: ReadonlySet<string>,
): Finding[] {
  return report.findings.filter((finding) => {
    if (!prFiles.has(finding.file)) {
      return false;
    }
    return true;
  });
}
