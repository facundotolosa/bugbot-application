import { describe, expect, it } from "vitest";

import { discoverCases } from "./discover-cases.js";

describe("discoverCases", () => {
  it("discovers at least six v1 golden cases", async () => {
    const cases = await discoverCases({ refreshInputs: false, suites: [] });
    expect(cases.length).toBeGreaterThanOrEqual(6);

    const suites = new Set(cases.map((c) => c.suite));
    expect(suites.has("e2e")).toBe(true);
    expect(suites.has("analyzer-security")).toBe(true);
    expect(suites.has("analyzer-performance")).toBe(true);
    expect(suites.has("validator")).toBe(true);

    const e2e = cases.filter((c) => c.suite === "e2e");
    expect(e2e.length).toBeGreaterThanOrEqual(2);
  });
});
