import { describe, expect, it } from "vitest";
import { buildKnownIssuesJson, filterFindingsForPost } from "./post-review.js";
import type { FindingsReport } from "./findings.js";

const report: FindingsReport = {
  version: "1",
  findings: [
    {
      severity: "warning",
      file: "src/in-pr.ts",
      line: 10,
      problem: "bug in pr",
      suggestion: "fix",
    },
    {
      severity: "warning",
      file: "src/out-of-pr.ts",
      line: 5,
      problem: "outside pr",
      suggestion: "ignore",
    },
    {
      severity: "error",
      file: "src/in-pr.ts",
      line: 20,
      problem: "duplicate line",
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
  it("drops findings outside prFiles and duplicate file-line keys", () => {
    const prFiles = new Set(["src/in-pr.ts"]);
    const filtered = filterFindingsForPost(report, prFiles, [
      { file: "src/in-pr.ts", line: 20 },
    ]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({ file: "src/in-pr.ts", line: 10 });
  });
});
