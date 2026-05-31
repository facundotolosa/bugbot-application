import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { structuralGateFromText } from "./structural.js";

const FIXTURES = join(import.meta.dirname, "__fixtures__");

describe("structuralGateFromText", () => {
  it("accepts valid findings v2", () => {
    const text = readFileSync(join(FIXTURES, "findings-v2.json"), "utf8");
    const gate = structuralGateFromText(text, "findings");
    expect(gate.findingsReport.version).toBe("2");
    expect(gate.findingsReport.findings).toHaveLength(1);
  });

  it("accepts analyzer security output", () => {
    const text = readFileSync(join(FIXTURES, "analyzer-security.json"), "utf8");
    const gate = structuralGateFromText(text, "analyzer", "security");
    expect(gate.findingsReport.findings[0]?.analyzer).toBe("security");
  });

  it("accepts validator output with filter_summary", () => {
    const text = readFileSync(join(FIXTURES, "validator-output.json"), "utf8");
    const gate = structuralGateFromText(text, "validator-output");
    expect(gate.filterSummary?.final_output).toBe(1);
  });

  it("rejects malformed JSON without downstream validation", () => {
    expect(() => structuralGateFromText("{ not json", "findings")).toThrow(
      /valid JSON/i,
    );
  });

  it("rejects findings v1", () => {
    expect(() =>
      structuralGateFromText(
        JSON.stringify({ version: "1", findings: [] }),
        "findings",
      ),
    ).toThrow(/version/);
  });
});
