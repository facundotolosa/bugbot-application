import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatCommentBody, toInlineReviewComments } from "./comments.js";
import type { AnalyzerKey, Finding, Severity } from "./findings.js";
import { parseFindingsJson } from "./findings.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures");

function finding(
  overrides: Partial<Finding> & Pick<Finding, "analyzer" | "severity" | "issue" | "suggestion">,
): Finding {
  return {
    file: "src/a.ts",
    line: 1,
    ...overrides,
  };
}

describe("formatCommentBody", () => {
  it.each<[AnalyzerKey, string]>([
    ["security", "Security analyzer"],
    ["performance", "Performance analyzer"],
  ])("uses %s analyzer title", (analyzer, title) => {
    const body = formatCommentBody(
      finding({
        analyzer,
        severity: "major",
        issue: "example issue",
        suggestion: "example suggestion",
      }),
    );
    expect(body).toContain(`### 🤖 ${title}`);
  });

  it.each<[Severity, string]>([
    ["critical", "🚨"],
    ["major", "⚠️"],
    ["minor", "💡"],
    ["enhancement", "✨"],
  ])("prefixes issue line with %s emoji", (severity, emoji) => {
    const body = formatCommentBody(
      finding({
        analyzer: "security",
        severity,
        issue: "the issue text",
        suggestion: "the suggestion",
      }),
    );
    expect(body).toContain(`${emoji} the issue text`);
  });

  it("always uses 💡 **Suggestion:** on the suggestion line regardless of severity", () => {
    const body = formatCommentBody(
      finding({
        analyzer: "performance",
        severity: "critical",
        issue: "hot path",
        suggestion: "cache the result",
      }),
    );
    expect(body).toContain("💡 **Suggestion:** cache the result");
    expect(body).not.toMatch(/\n💡 \*\*Suggestion:\*\*.*\n.*🚨/);
  });

  it("matches spec example structure for performance minor", () => {
    const body = formatCommentBody(
      finding({
        analyzer: "performance",
        severity: "minor",
        issue:
          "`getPracticeAccountFeatures` loads accountFeatures even though only `practice.country` is used.",
        suggestion:
          "Use a country-only projection or `context.practice.country` when present.",
      }),
    );
    expect(body).toBe(
      [
        "### 🤖 Performance analyzer",
        "",
        "💡 `getPracticeAccountFeatures` loads accountFeatures even though only `practice.country` is used.",
        "",
        "💡 **Suggestion:** Use a country-only projection or `context.practice.country` when present.",
      ].join("\n"),
    );
  });
});

describe("toInlineReviewComments", () => {
  it("maps fixture findings with line numbers to inline comments", async () => {
    const text = await readFile(join(fixturesDir, "findings.json"), "utf8");
    const report = parseFindingsJson(text);
    const comments = toInlineReviewComments(report);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      path: ".cursor/skills/ai-code-review/examples/smoke-target.ts",
      line: 3,
      side: "RIGHT",
    });
    expect(comments[0].body).toContain("### 🤖 Security analyzer");
    expect(comments[0].body).toContain("⚠️ Division by zero");
    expect(comments[0].body).toContain("💡 **Suggestion:**");
  });

  it("skips findings without line numbers", async () => {
    const text = await readFile(join(fixturesDir, "findings.json"), "utf8");
    const report = parseFindingsJson(text);
    const withoutLine = report.findings.filter((f) => f.line == null);
    expect(withoutLine).toHaveLength(1);
    const comments = toInlineReviewComments(report);
    expect(comments.every((c) => c.line != null)).toBe(true);
  });

  it("returns empty array for empty findings", () => {
    const comments = toInlineReviewComments({ version: "2", findings: [] });
    expect(comments).toEqual([]);
  });
});

describe("parseFindingsJson", () => {
  const minimalV2Finding = {
    analyzer: "security" as const,
    severity: "major" as const,
    file: "src/a.ts",
    line: 1,
    issue: "issue text",
    suggestion: "suggestion text",
  };

  it("accepts minimal valid v2 document from spec", () => {
    const report = parseFindingsJson(
      JSON.stringify({ version: "2", findings: [minimalV2Finding] }),
    );
    expect(report).toEqual({ version: "2", findings: [minimalV2Finding] });
  });

  it("rejects v1 and unknown version", () => {
    expect(() =>
      parseFindingsJson(
        '{"version":"1","findings":[{"severity":"warning","file":"a.ts","problem":"p","suggestion":"s"}]}',
      ),
    ).toThrow(/no longer supported|"1"/);
    expect(() => parseFindingsJson('{"version":"3","findings":[]}')).toThrow(/version/);
    expect(() => parseFindingsJson('{"version":"2"}')).toThrow(/findings/);
  });

  it("rejects empty issue or suggestion", () => {
    expect(() =>
      parseFindingsJson(
        JSON.stringify({
          version: "2",
          findings: [{ ...minimalV2Finding, issue: "   " }],
        }),
      ),
    ).toThrow(/issue/);
    expect(() =>
      parseFindingsJson(
        JSON.stringify({
          version: "2",
          findings: [{ ...minimalV2Finding, suggestion: "" }],
        }),
      ),
    ).toThrow(/suggestion/);
  });
});
