import type { Finding, FindingsReport } from "./findings.js";

export interface InlineReviewComment {
  path: string;
  line: number;
  side: "RIGHT";
  body: string;
}

export function formatCommentBody(problem: string, suggestion: string): string {
  return `*Problem*\n${problem}\n\nSuggested fix: *${suggestion}*`;
}

export function toInlineReviewComments(report: FindingsReport): InlineReviewComment[] {
  const comments: InlineReviewComment[] = [];
  for (const finding of report.findings) {
    if (!finding.file || finding.line == null) {
      continue;
    }
    comments.push({
      path: finding.file,
      line: finding.line,
      side: "RIGHT",
      body: formatCommentBody(finding.issue, finding.suggestion),
    });
  }
  return comments;
}

export function findingsWithInlineComments(report: FindingsReport): Finding[] {
  return report.findings.filter((f) => f.file && f.line != null);
}
