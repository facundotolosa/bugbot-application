import { describe, expect, it } from "vitest";
import { shouldSuppressProcessNoise, stripSdkBootstrapNoise } from "./process-guard.js";

describe("shouldSuppressProcessNoise", () => {
  it("matches AbortSignal MaxListenersExceededWarning", () => {
    const line =
      "(node:2437) MaxListenersExceededWarning: Possible EventTarget memory leak detected. 11 abort listeners added to [AbortSignal]. MaxListeners is 10.";
    expect(shouldSuppressProcessNoise(line)).toBe(true);
  });

  it("does not suppress unrelated stderr", () => {
    expect(shouldSuppressProcessNoise("real error line\n")).toBe(false);
  });

  it("suppresses Cursor SDK rules/skills bootstrap INFO lines", () => {
    const chunk =
      "13:40:20.161 INFO LocalCursorRulesService load completed meta={durationMs: 150, ruleCount: 2}\n" +
      "13:40:20.209 INFO AgentSkillsCursorRulesService load completed meta={durationMs: 193, ruleCount: 7, skillCount: 7}\n";
    expect(shouldSuppressProcessNoise(chunk)).toBe(true);
  });
});

describe("stripSdkBootstrapNoise", () => {
  it("drops bootstrap lines but keeps mixed chunk output", () => {
    const chunk =
      "13:40:20.161 INFO LocalCursorRulesService load completed meta={}\n" +
      "› Launching Cursor agent…\n";
    expect(stripSdkBootstrapNoise(chunk)).toBe("› Launching Cursor agent…\n");
  });

  it("drops bootstrap lines with ANSI color codes", () => {
    const chunk =
      "\x1b[34m15:18:14.871 INFO\x1b[0m LocalCursorRulesService load completed meta={durationMs: 46}\n";
    expect(stripSdkBootstrapNoise(chunk)).toBeNull();
  });
});
