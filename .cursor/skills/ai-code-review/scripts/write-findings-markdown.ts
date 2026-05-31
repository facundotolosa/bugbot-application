import { readFileSync, writeFileSync } from "node:fs";
import type { Finding, FindingsReport, Severity } from "../../../../packages/reviewer-runner/src/findings.js";
import { parseFindingsJson } from "../../../../packages/reviewer-runner/src/findings.js";

export const SEVERITY_ORDER: readonly Severity[] = [
  "critical",
  "major",
  "minor",
  "enhancement",
] as const;

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  major: "Major",
  minor: "Minor",
  enhancement: "Enhancement",
};

export interface MarkdownReportMetadata {
  sourceRef?: string;
  targetRef?: string;
  isIncremental?: boolean;
  diffBase?: string;
}

export interface MarkdownReportOptions {
  generatedAt?: Date;
  metadata?: MarkdownReportMetadata;
}

function severityRank(severity: Severity): number {
  const index = SEVERITY_ORDER.indexOf(severity);
  return index === -1 ? SEVERITY_ORDER.length : index;
}

export function compareFindingsBySeverity(a: Finding, b: Finding): number {
  const bySeverity = severityRank(a.severity) - severityRank(b.severity);
  if (bySeverity !== 0) return bySeverity;
  const byFile = a.file.localeCompare(b.file);
  if (byFile !== 0) return byFile;
  return (a.line ?? 0) - (b.line ?? 0);
}

function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = {
    critical: 0,
    major: 0,
    minor: 0,
    enhancement: 0,
  };
  for (const f of findings) {
    counts[f.severity] += 1;
  }
  return counts;
}

function formatLocation(finding: Finding): string {
  return finding.line !== undefined
    ? `\`${finding.file}\` (line ${finding.line})`
    : `\`${finding.file}\``;
}

function formatFindingBlock(finding: Finding, index: number): string {
  const lines = [
    `### ${index}. ${formatLocation(finding)} · ${finding.analyzer}`,
    "",
    `**Issue:** ${finding.issue}`,
    "",
    `**Suggestion:** ${finding.suggestion}`,
  ];
  return lines.join("\n");
}

function formatSummaryCounts(counts: Record<Severity, number>, total: number): string {
  const parts = [`${total} finding${total === 1 ? "" : "s"}`];
  for (const severity of SEVERITY_ORDER) {
    if (counts[severity] > 0) {
      parts.push(`${severity} ${counts[severity]}`);
    }
  }
  return parts.join(" · ");
}

function formatSeveritySection(severity: Severity, findings: Finding[]): string | null {
  const sectionFindings = findings.filter((f) => f.severity === severity);
  if (sectionFindings.length === 0) {
    return null;
  }
  const lines = [`## ${SEVERITY_LABEL[severity]}`, ""];
  sectionFindings.forEach((finding, i) => {
    lines.push(formatFindingBlock(finding, i + 1), "");
  });
  return lines.join("\n");
}

export function formatFindingsMarkdown(
  report: FindingsReport,
  options: MarkdownReportOptions = {},
): string {
  const generatedAt = (options.generatedAt ?? new Date()).toISOString();
  const sorted = [...report.findings].sort(compareFindingsBySeverity);
  const counts = countBySeverity(sorted);
  const total = sorted.length;

  const header: string[] = ["# AI Code Review", ""];

  if (options.metadata?.sourceRef || options.metadata?.targetRef) {
    const source = options.metadata.sourceRef ?? "?";
    const target = options.metadata.targetRef ?? "?";
    header.push(`**Scope:** \`${source}\` → \`${target}\``);
  }
  if (options.metadata?.diffBase !== undefined) {
    if (options.metadata.isIncremental) {
      header.push(`**Mode:** incremental (since \`${options.metadata.diffBase}\`)`);
    } else {
      header.push(`**Mode:** full (base \`${options.metadata.diffBase}\`)`);
    }
  }
  if (
    options.metadata?.sourceRef ||
    options.metadata?.targetRef ||
    options.metadata?.diffBase !== undefined
  ) {
    header.push("");
  }

  header.push(
    `**Generated:** ${generatedAt}`,
    "",
    `**Summary:** ${formatSummaryCounts(counts, total)}`,
    "",
    "---",
    "",
  );

  const sections = SEVERITY_ORDER.map((severity) =>
    formatSeveritySection(severity, sorted),
  ).filter((section): section is string => section !== null);

  return [...header, ...sections].join("\n").trimEnd() + "\n";
}

export function writeFindingsMarkdownFile(
  findingsPath: string,
  outputPath: string,
  options: MarkdownReportOptions = {},
): void {
  const report = parseFindingsJson(readFileSync(findingsPath, "utf8"));
  writeFileSync(outputPath, formatFindingsMarkdown(report, options), "utf8");
}

function main(): void {
  const runDir = process.env.AI_CODE_REVIEW_RUN_DIR;
  const defaultFindings = runDir
    ? `${runDir}/findings.json`
    : ".ai-code-review/findings.json";
  const defaultMarkdown = runDir
    ? `${runDir}/findings.md`
    : ".ai-code-review/findings.md";
  const defaultPrepareDiff = runDir
    ? `${runDir}/prepare-diff.json`
    : ".ai-code-review/prepare-diff.json";
  const findingsPath = process.argv[2] ?? defaultFindings;
  const outputPath = process.argv[3] ?? defaultMarkdown;
  const prepareDiffPath = process.argv[4] ?? defaultPrepareDiff;
  const metadata = loadOptionalMetadata(prepareDiffPath);
  writeFindingsMarkdownFile(findingsPath, outputPath, { metadata });
}

function loadOptionalMetadata(prepareDiffPath: string): MarkdownReportMetadata | undefined {
  try {
    const data = JSON.parse(readFileSync(prepareDiffPath, "utf8")) as {
      metadata?: {
        is_incremental?: boolean;
        since_commit?: string;
        diff_base?: string;
        merge_base?: string;
      };
    };
    const meta = data.metadata;
    if (!meta) return undefined;
    return {
      isIncremental: meta.is_incremental,
      diffBase: meta.is_incremental ? meta.since_commit ?? meta.diff_base : meta.merge_base ?? meta.diff_base,
    };
  } catch {
    return undefined;
  }
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("write-findings-markdown.ts") ||
    process.argv[1].endsWith("write-findings-markdown.js"));

if (isMain) {
  main();
}
