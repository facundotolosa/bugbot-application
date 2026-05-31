import { describe, expect, it } from "vitest";

import { buildJudgePrompt } from "./judge.js";
import type { ExpectationJudgeRequest } from "./types.js";

describe("buildJudgePrompt", () => {
  it("includes rubric, expectation, and JSON-only response instruction", () => {
    const request: ExpectationJudgeRequest = {
      kind: "must_find",
      index: 0,
      expectation: { file: "src/auth.ts", match: "api key" },
      rubric: "Must report hardcoded API key near the hunk.",
      findingsPayload: { version: "2", findings: [] },
    };

    const prompt = buildJudgePrompt(request);
    expect(prompt).toContain("Must report hardcoded API key");
    expect(prompt).toContain("src/auth.ts");
    expect(prompt).toContain('{"pass": true|false');
    expect(prompt).toContain("must_find");
  });
});
