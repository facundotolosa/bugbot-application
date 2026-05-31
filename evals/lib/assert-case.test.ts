import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { assertCaseFromText } from "./assert-case.js";
import type { JudgeFn } from "./judge.js";
import { parseExpectJson } from "./expect.js";

const FIXTURES = join(import.meta.dirname, "__fixtures__");

describe("assertCaseFromText", () => {
  it("fails on structural error without calling judge", async () => {
    const judgeFn = vi.fn<JudgeFn>();
    const caseExpect = parseExpectJson(
      readFileSync(join(FIXTURES, "ws-case/expect.json"), "utf8"),
    );

    const result = await assertCaseFromText({
      expect: caseExpect,
      artifactText: "{ broken",
      artifactKind: "findings",
      judgeFn,
    });

    expect(result.pass).toBe(false);
    expect(result.structuralError).toMatch(/JSON/i);
    expect(judgeFn).not.toHaveBeenCalled();
  });

  it("passes when mock judge approves all expectations", async () => {
    const judgeFn: JudgeFn = async (req) => ({
      pass: true,
      reason: `approved ${req.kind}`,
    });
    const caseExpect = parseExpectJson(
      readFileSync(join(FIXTURES, "ws-case/expect.json"), "utf8"),
    );
    const artifactText = readFileSync(join(FIXTURES, "findings-v2.json"), "utf8");

    const result = await assertCaseFromText({
      expect: caseExpect,
      artifactText,
      artifactKind: "findings",
      judgeFn,
    });

    expect(result.pass).toBe(true);
    expect(result.expectationVerdicts).toHaveLength(1);
    expect(result.expectationVerdicts[0]?.result.pass).toBe(true);
  });

  it("fails when mock judge rejects an expectation", async () => {
    const judgeFn: JudgeFn = async () => ({
      pass: false,
      reason: "missing finding",
    });
    const caseExpect = parseExpectJson(
      readFileSync(join(FIXTURES, "ws-case/expect.json"), "utf8"),
    );
    const artifactText = readFileSync(join(FIXTURES, "findings-v2.json"), "utf8");

    const result = await assertCaseFromText({
      expect: caseExpect,
      artifactText,
      artifactKind: "findings",
      judgeFn,
    });

    expect(result.pass).toBe(false);
    expect(result.expectationVerdicts[0]?.result.pass).toBe(false);
  });

  it("checks validator_funnel against filter_summary", async () => {
    const judgeFn: JudgeFn = async () => ({ pass: true, reason: "ok" });
    const caseExpect = parseExpectJson(
      JSON.stringify({
        suite: "validator",
        must_find: [{ file: "src/auth.ts" }],
        judge: { rubric: "x" },
        validator_funnel: { final_output_min: 5 },
      }),
    );
    const artifactText = readFileSync(
      join(FIXTURES, "validator-output.json"),
      "utf8",
    );

    const result = await assertCaseFromText({
      expect: caseExpect,
      artifactText,
      artifactKind: "validator-output",
      judgeFn,
    });

    expect(result.pass).toBe(false);
    expect(result.funnelError).toMatch(/final_output/);
  });
});
