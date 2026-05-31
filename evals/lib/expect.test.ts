import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadExpectFile, parseExpectJson } from "./expect.js";

const FIXTURES = join(import.meta.dirname, "__fixtures__");

describe("parseExpectJson", () => {
  it("parses valid expect.json", () => {
    const text = readFileSync(join(FIXTURES, "ws-case/expect.json"), "utf8");
    const parsed = parseExpectJson(text);
    expect(parsed.suite).toBe("analyzer-security");
    expect(parsed.judge.rubric).toContain("smoke");
    expect(parsed.must_find).toHaveLength(1);
  });

  it("rejects missing judge.rubric", () => {
    expect(() =>
      parseExpectJson(
        JSON.stringify({
          suite: "validator",
          must_find: [{ file: "a.ts" }],
          judge: {},
        }),
      ),
    ).toThrow(/judge\.rubric/);
  });

  it("rejects when no expectations", () => {
    expect(() =>
      parseExpectJson(
        JSON.stringify({
          suite: "validator",
          judge: { rubric: "x" },
        }),
      ),
    ).toThrow(/must_find or must_not_find/);
  });
});

describe("loadExpectFile", () => {
  it("loads from disk", async () => {
    const parsed = await loadExpectFile(join(FIXTURES, "ws-case/expect.json"));
    expect(parsed.suite).toBe("analyzer-security");
  });
});
