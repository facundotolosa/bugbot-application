import { describe, expect, it } from "vitest";
import type { FindingsReport } from "../../../../packages/reviewer-runner/src/findings.js";
import { formatFindingsMarkdown } from "./write-findings-markdown.js";

const sample: FindingsReport = {
  version: "2",
  findings: [
    {
      analyzer: "performance",
      severity: "enhancement",
      file: "evals/lib/workspace.ts",
      line: 79,
      issue: "Extra temp dir per case.",
      suggestion: "Reuse worktree session dir.",
    },
    {
      analyzer: "security",
      severity: "critical",
      file: "src/auth.ts",
      line: 10,
      issue: "Hardcoded secret.",
      suggestion: "Use env var.",
    },
    {
      analyzer: "performance",
      severity: "minor",
      file: "evals/lib/run-e2e.ts",
      line: 179,
      issue: "Session leak.",
      suggestion: "Call cleanup.",
    },
  ],
};

describe("formatFindingsMarkdown", () => {
  it("orders sections by severity (critical first, enhancement last)", () => {
    const md = formatFindingsMarkdown(sample, {
      generatedAt: new Date("2026-05-31T12:00:00.000Z"),
    });
    const criticalIdx = md.indexOf("## Critical");
    const majorIdx = md.indexOf("## Major");
    const minorIdx = md.indexOf("## Minor");
    const enhancementIdx = md.indexOf("## Enhancement");
    expect(criticalIdx).toBeLessThan(majorIdx);
    expect(majorIdx).toBeLessThan(minorIdx);
    expect(minorIdx).toBeLessThan(enhancementIdx);
  });

  it("lists findings under the matching severity section", () => {
    const md = formatFindingsMarkdown(sample);
    expect(md).toContain("src/auth.ts");
    expect(md).toContain("evals/lib/run-e2e.ts");
    expect(md).toContain("evals/lib/workspace.ts");
    const criticalSection = md.slice(
      md.indexOf("## Critical"),
      md.indexOf("## Major"),
    );
    expect(criticalSection).toContain("Hardcoded secret.");
    expect(criticalSection).not.toContain("Session leak.");
  });

  it("includes summary counts", () => {
    const md = formatFindingsMarkdown(sample);
    expect(md).toContain(
      "**Summary:** 3 findings · critical 1 · major 0 · minor 1 · enhancement 1",
    );
  });

  it("handles empty findings", () => {
    const md = formatFindingsMarkdown({ version: "2", findings: [] });
    expect(md).toContain("**Summary:** 0 findings");
    expect(md).toContain("_No findings._");
  });

  it("includes diff mode from metadata", () => {
    const md = formatFindingsMarkdown({ version: "2", findings: [] }, {
      metadata: { isIncremental: false, diffBase: "abc123" },
    });
    expect(md).toContain("**Mode:** full (base `abc123`)");
  });
});
