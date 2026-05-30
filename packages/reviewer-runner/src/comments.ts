import type { AnalyzerKey, Finding, FindingsReport, Severity } from "./findings.js";

export interface InlineReviewComment {
  path: string;
  line: number;
  side: "RIGHT";
  body: string;
}

const ANALYZER_TITLES: Record<AnalyzerKey, string> = {
  security: "Security analyzer",
  performance: "Performance analyzer",
};

const SEVERITY_EMOJIS: Record<Severity, string> = {
  critical: "🚨",
  major: "⚠️",
  minor: "💡",
  enhancement: "✨",
};

export function formatCommentBody(finding: Finding): string {
  const title = ANALYZER_TITLES[finding.analyzer];
  const emoji = SEVERITY_EMOJIS[finding.severity];
  return [
    `### 🤖 ${title}`,
    "",
    `${emoji} ${finding.issue}`,
    "",
    `💡 **Suggestion:** ${finding.suggestion}`,
  ].join("\n");
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
      body: formatCommentBody(finding),
    });
  }
  return comments;
}

export function findingsWithInlineComments(report: FindingsReport): Finding[] {
  return report.findings.filter((f) => f.file && f.line != null);
}
