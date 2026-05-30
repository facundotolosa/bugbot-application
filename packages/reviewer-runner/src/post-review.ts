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
  knownIssues: readonly Pick<KnownIssue, "file" | "line">[],
): Finding[] {
  const knownKeys = new Set(knownIssues.map((issue) => `${issue.file}:${issue.line}`));

  return report.findings.filter((finding) => {
    if (!prFiles.has(finding.file)) {
      return false;
    }
    if (finding.line == null) {
      return true;
    }
    const key = `${finding.file}:${finding.line}`;
    return !knownKeys.has(key);
  });
}
