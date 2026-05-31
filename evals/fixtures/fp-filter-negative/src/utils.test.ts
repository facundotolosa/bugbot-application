import { describe, it, expect } from "vitest";

describe("utils", () => {
  it("formats labels", () => {
    expect(formatLabel("x")).toBe("x");
  });
});

function formatLabel(value: string): string {
  return value;
}
