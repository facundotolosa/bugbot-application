import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatCommentBody, toInlineReviewComments } from "./comments.js";
import { parseFindingsJson } from "./findings.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

describe("formatCommentBody", () => {
  it("matches GitHub PR inline template", () => {
    const body = formatCommentBody(
      "Division by zero when value is 0.",
      "Guard with `if (value === 0) return 0` or throw a clear error.",
    );
    expect(body).toBe(
      "*Problem*\nDivision by zero when value is 0.\n\nSuggested fix: *Guard with `if (value === 0) return 0` or throw a clear error.*",
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
    expect(comments[0].body).toContain("*Problem*");
    expect(comments[0].body).toContain("Suggested fix:");
  });

  it("returns empty array for empty findings", () => {
    const comments = toInlineReviewComments({ version: "2", findings: [] });
    expect(comments).toEqual([]);
  });
});

describe("parseFindingsJson", () => {
  const minimalV2Finding = {
    analyzer: "security",
    severity: "major",
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
