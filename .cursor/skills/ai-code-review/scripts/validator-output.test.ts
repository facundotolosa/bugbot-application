import { describe, expect, it } from "vitest";
import { parseFindingsJson } from "../../../../packages/reviewer-runner/src/findings.js";
import {
  mapValidatorToFindingsReport,
  parseValidatorOutput,
  zeroedFilterSummary,
} from "./validator-output.js";

const validSummary = {
  raw_input: 30,
  after_exact_dedup: 25,
  after_root_cause_dedup: 22,
  after_dedup: 22,
  after_fp_filters: 15,
  after_known_issues: 13,
  after_verification: 9,
  final_output: 9,
};

describe("parseValidatorOutput", () => {
  it("parses valid fixture and maps to v2 report accepted by parseFindingsJson", () => {
    const output = parseValidatorOutput({
      findings: [
        {
          file: "src/a.ts",
          line: 42,
          severity: "major",
          analyzer: "security",
          issue: "SQL injection risk",
          suggestion: "Use parameterized queries",
          emoji: "⚠️",
        },
      ],
      filter_summary: validSummary,
    });
    const report = mapValidatorToFindingsReport(output);
    expect(parseFindingsJson(JSON.stringify(report))).toEqual(report);
    expect(report.findings[0]).not.toHaveProperty("emoji");
    expect(report.findings[0]).toMatchObject({
      analyzer: "security",
      severity: "major",
      file: "src/a.ts",
      line: 42,
    });
  });

  it("throws when filter_summary is missing", () => {
    expect(() =>
      parseValidatorOutput({
        findings: [],
      }),
    ).toThrow(/filter_summary/);
  });

  it("throws when filter_summary has wrong keys", () => {
    expect(() =>
      parseValidatorOutput({
        findings: [],
        filter_summary: { raw_input: 1 },
      }),
    ).toThrow(/filter_summary/);
  });

  it("throws when after_ticket_crossref is present", () => {
    expect(() =>
      parseValidatorOutput({
        findings: [],
        filter_summary: {
          ...validSummary,
          after_ticket_crossref: 0,
        },
      }),
    ).toThrow(/after_ticket_crossref/);
  });
});

describe("zeroedFilterSummary", () => {
  it("returns all counters as zero", () => {
    const summary = zeroedFilterSummary();
    expect(Object.values(summary).every((n) => n === 0)).toBe(true);
  });
});
