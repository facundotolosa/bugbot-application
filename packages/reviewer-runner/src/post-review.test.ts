import { describe, expect, it } from "vitest";
import { buildKnownIssuesJson, filterFindingsForPost } from "./post-review.js";
import type { FindingsReport } from "./findings.js";

const report: FindingsReport = {
  version: "2",
  findings: [
    {
      analyzer: "security",
      severity: "major",
      file: "src/in-pr.ts",
      line: 10,
      issue: "bug in pr",
      suggestion: "fix",
    },
    {
      analyzer: "security",
      severity: "major",
      file: "src/out-of-pr.ts",
      line: 5,
      issue: "outside pr",
      suggestion: "ignore",
    },
    {
      analyzer: "performance",
      severity: "critical",
      file: "src/in-pr.ts",
      line: 20,
      issue: "duplicate line",
      suggestion: "fix dup",
    },
  ],
};

describe("buildKnownIssuesJson", () => {
  it("wraps inline comments with full message bodies", () => {
    const body = "x".repeat(300);
    const json = buildKnownIssuesJson([
      { file: "src/a.ts", line: 1, message: body },
    ]);
    expect(json.issues[0].message).toBe(body);
  });
});

describe("filterFindingsForPost", () => {
  it("drops findings outside prFiles but keeps findings at known-issue file-line keys", () => {
    const prFiles = new Set(["src/in-pr.ts"]);
    const { findings, droppedOutOfPr } = filterFindingsForPost(report, prFiles);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.line).sort()).toEqual([10, 20]);
    expect(droppedOutOfPr).toBe(1);
  });
});
