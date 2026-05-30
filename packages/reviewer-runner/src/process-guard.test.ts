import { describe, expect, it } from "vitest";
import { shouldSuppressProcessNoise } from "./process-guard.js";

describe("shouldSuppressProcessNoise", () => {
  it("matches AbortSignal MaxListenersExceededWarning", () => {
    const line =
      "(node:2437) MaxListenersExceededWarning: Possible EventTarget memory leak detected. 11 abort listeners added to [AbortSignal]. MaxListeners is 10.";
    expect(shouldSuppressProcessNoise(line)).toBe(true);
  });

  it("does not suppress unrelated stderr", () => {
    expect(shouldSuppressProcessNoise("real error line\n")).toBe(false);
  });
});
