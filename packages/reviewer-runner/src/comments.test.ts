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
      path: "skills/ai-code-review/examples/smoke-target.ts",
      line: 3,
      side: "RIGHT",
    });
    expect(comments[0].body).toContain("*Problem*");
    expect(comments[0].body).toContain("Suggested fix:");
  });

  it("returns empty array for empty findings", () => {
    const comments = toInlineReviewComments({ version: "1", findings: [] });
    expect(comments).toEqual([]);
  });
});

describe("parseFindingsJson", () => {
  it("rejects invalid schema", () => {
    expect(() => parseFindingsJson('{"version":"2","findings":[]}')).toThrow(/version/);
    expect(() => parseFindingsJson('{"version":"1"}')).toThrow(/findings/);
  });
});
