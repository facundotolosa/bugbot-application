import { afterEach, describe, expect, it, vi } from "vitest";

import { parseCliArgs, requireCursorApiKey } from "./cli.js";

describe("cli", () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
    vi.restoreAllMocks();
  });

  it("parses suite, case, and refresh-inputs", () => {
    expect(
      parseCliArgs([
        "--suite",
        "analyzer-security",
        "--case",
        "leaked-key",
        "--refresh-inputs",
      ]),
    ).toEqual({
      suite: "analyzer-security",
      suites: ["analyzer-security"],
      caseId: "leaked-key",
      refreshInputs: true,
    });
  });

  it("exits when CURSOR_API_KEY is unset", () => {
    delete process.env.CURSOR_API_KEY;
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    requireCursorApiKey();

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("CURSOR_API_KEY"),
    );
    expect(exit).toHaveBeenCalledWith(1);
  });
});
