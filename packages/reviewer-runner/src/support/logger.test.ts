import { afterEach, describe, expect, it, vi } from "vitest";
import {
  done,
  error,
  header,
  meta,
  ok,
  orchestratorLine,
  prompt,
  shouldUseColor,
  step,
  stripAnsi,
  subAgentDone,
  subAgentLaunched,
  reviewOutcome,
  warn,
} from "./logger.js";

const envBackup = { ...process.env };

afterEach(() => {
  process.env = { ...envBackup };
  vi.restoreAllMocks();
});

function captureStdout(fn: () => void): string {
  const chunks: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    chunks.push(String(chunk));
    return true;
  });
  fn();
  return chunks.join("");
}

function captureStderr(fn: () => void): string {
  const chunks: string[] = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    chunks.push(String(chunk));
    return true;
  });
  fn();
  return chunks.join("");
}

describe("shouldUseColor", () => {
  it("disables color when NO_COLOR is set", () => {
    expect(shouldUseColor({ NO_COLOR: "1" }, true)).toBe(false);
  });

  it("disables color on non-TTY without FORCE_COLOR", () => {
    expect(shouldUseColor({}, false)).toBe(false);
  });

  it("enables color with FORCE_COLOR=1 without TTY", () => {
    expect(shouldUseColor({ FORCE_COLOR: "1" }, false)).toBe(true);
  });
});

describe("logger output", () => {
  it("uses no ANSI escapes when NO_COLOR is set", () => {
    process.env.NO_COLOR = "1";
    const out = captureStdout(() => {
      header("AI Code Review");
      ok("ready");
    });
    expect(out).not.toMatch(/\x1b\[/);
    expect(out).toContain("AI Code Review");
    expect(out).toContain("✔ ready");
  });

  it("uses ANSI when FORCE_COLOR=1 without TTY", () => {
    process.env = { FORCE_COLOR: "1" };
    const out = captureStdout(() => ok("colored"));
    expect(out).toMatch(/\x1b\[/);
    expect(stripAnsi(out)).toContain("✔ colored");
  });

  it("formats header, meta, step, done, prompt, summary, sub-agents", () => {
    process.env = { FORCE_COLOR: "1" };
    const out = captureStdout(() => {
      header("Run");
      meta("repo", "/tmp/app");
      step("prepare");
      done("finished");
      prompt("line one\nline two", { chars: 20, knownIssues: 2 });
      reviewOutcome("complete", {
        mode: "full",
        findings: 3,
        posted: 2,
        tracking: "#99",
      });
      subAgentLaunched("security analyzer");
      subAgentDone("completed", 12.34, "security analyzer");
      subAgentDone("error", 1.2, "validator");
    });
    const plain = stripAnsi(out);
    expect(plain).toContain("Run");
    expect(plain).toContain("repo");
    expect(plain).toContain("/tmp/app");
    expect(plain).toContain("› prepare");
    expect(plain).toContain("finished");
    expect(plain).toContain("Prompt");
    expect(plain).toContain("20 chars · 2 known issue(s)");
    expect(plain).toContain("Review complete");
    expect(plain).toMatch(/3 findings.*2 posted.*#99/);
    expect(plain).toContain("Launched: security analyzer");
    expect(plain).toContain("Completed (12.3s): security analyzer");
    expect(plain).toContain("Failed (1.2s): validator");
  });

  it("bolds Validator skipped emoji block title", () => {
    process.env = { FORCE_COLOR: "1" };
    const out = captureStdout(() => {
      orchestratorLine("⏭️ Validator skipped: all analyzers returned no findings");
    });
    expect(out).toMatch(/\x1b\[1mValidator skipped:\x1b\[0m/);
    expect(stripAnsi(out)).toContain("all analyzers returned no findings");
  });

  it("colors only [orchestrator] prefix on emoji blocks (title bold, body plain)", () => {
    process.env = { FORCE_COLOR: "1" };
    const out = captureStdout(() => {
      orchestratorLine(
        "📋 PR Metadata: source 'feature/foo' → target 'main'; incremental no",
      );
    });
    const plain = stripAnsi(out);
    expect(plain).toContain("[orchestrator]");
    expect(plain).toContain("PR Metadata:");
    expect(plain).toContain("source 'feature/foo'");
    const cyanCount = (out.match(/\x1b\[36m/g) ?? []).length;
    expect(cyanCount).toBe(1);
    expect(out).toMatch(/\x1b\[1mPR Metadata:\x1b\[0m/);
    expect(out).not.toMatch(/\x1b\[1m\x1b\[36mPR Metadata:/);
  });

  it("writes warn and error to stderr", () => {
    process.env = { FORCE_COLOR: "1" };
    const warnOut = stripAnsi(captureStderr(() => warn("careful")));
    const errOut = stripAnsi(captureStderr(() => error("boom")));
    expect(warnOut).toContain("⚠ careful");
    expect(errOut).toContain("✗ boom");
  });
});
