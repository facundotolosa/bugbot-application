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
      verbose: false,
    });
  });

  it("parses --verbose flag", () => {
    expect(parseCliArgs(["--verbose", "--suite", "e2e"])).toEqual({
      suite: "e2e",
      suites: ["e2e"],
      caseId: undefined,
      refreshInputs: false,
      verbose: true,
    });
  });

  it("reads EVAL_VERBOSE=1 when --verbose is absent", () => {
    process.env.EVAL_VERBOSE = "1";
    expect(parseCliArgs(["--suite", "e2e"]).verbose).toBe(true);
  });

  it("prefers --verbose over EVAL_VERBOSE=1", () => {
    process.env.EVAL_VERBOSE = "1";
    expect(parseCliArgs(["--verbose"]).verbose).toBe(true);
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
