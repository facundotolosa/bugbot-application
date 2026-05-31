import type { SDKMessage } from "@cursor/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OrchestratorStreamForwarder,
  SubAgentTracker,
  flushOrchestratorStream,
  formatOrchestratorLine,
  forwardOrchestratorText,
  humanSubagentDescription,
  logAgentStreamEvent,
  parseTaskArgs,
  resetOrchestratorStream,
  shouldForwardOrchestratorLine,
  stripOrchestratorMarkdown,
} from "./agent-stream.js";
import * as logger from "./support/logger.js";

afterEach(() => {
  resetOrchestratorStream();
  vi.restoreAllMocks();
});

describe("shouldForwardOrchestratorLine", () => {
  it("allows narration and prescribed blocks", () => {
    expect(shouldForwardOrchestratorLine("📋 PR Metadata:")).toBe(true);
    expect(shouldForwardOrchestratorLine("  source: main")).toBe(true);
    expect(shouldForwardOrchestratorLine("Launching security and performance analyzers.")).toBe(
      true,
    );
    expect(shouldForwardOrchestratorLine("Voy a leer la skill paso a paso.")).toBe(true);
  });

  it("drops empty lines and TodoWrite checklist noise", () => {
    expect(shouldForwardOrchestratorLine("")).toBe(false);
    expect(shouldForwardOrchestratorLine("- [x] analyzers")).toBe(false);
  });

  it("drops paraphrased skill-start lines (canonical start line only)", () => {
    expect(
      shouldForwardOrchestratorLine(
        "I'll read the ai-code-review skill and follow its workflow with your PR parameters.",
      ),
    ).toBe(false);
    expect(
      shouldForwardOrchestratorLine(
        "I'll run the ai-code-review skill with the PR parameters from the prompt.",
      ),
    ).toBe(true);
  });

  it("drops Validator funnel line (duplicates ✅ block)", () => {
    expect(shouldForwardOrchestratorLine("Validator funnel: 5 → 3")).toBe(false);
  });

  it("drops post-close verbose narration patterns", () => {
    expect(shouldForwardOrchestratorLine("---")).toBe(false);
    expect(shouldForwardOrchestratorLine("Final report: .ai-code-review/findings.json")).toBe(
      false,
    );
    expect(
      shouldForwardOrchestratorLine("Session artifacts were saved under .ai-code-review/run-artifacts/session/."),
    ).toBe(false);
  });

  it("drops markdown table rows (findings belong in findings.json)", () => {
    expect(
      shouldForwardOrchestratorLine("| Severity | File | Line | Issue |"),
    ).toBe(false);
    expect(shouldForwardOrchestratorLine("| minor | evals/lib/run-e2e.ts | 181 | leak |")).toBe(
      false,
    );
    expect(shouldForwardOrchestratorLine("|----------|------|------|-------|")).toBe(false);
  });
});

describe("stripOrchestratorMarkdown", () => {
  it("removes bold and fence markers", () => {
    expect(stripOrchestratorMarkdown("**bold** and ```ts\nx```")).toBe("bold and x");
  });
});

describe("formatOrchestratorLine", () => {
  it("prefixes orchestrator lines", () => {
    process.env.FORCE_COLOR = "1";
    const line = formatOrchestratorLine("Analyzers: security");
    expect(line).toContain("[orchestrator]");
    expect(line).toContain("Analyzers: security");
    delete process.env.FORCE_COLOR;
  });
});

describe("humanSubagentDescription", () => {
  it("maps known slugs", () => {
    expect(humanSubagentDescription("ai-code-review-security-analyzer")).toBe(
      "security analyzer",
    );
  });
});

describe("parseTaskArgs", () => {
  it("reads subagentType.name from SDK task args", () => {
    const { subagent_type, description } = parseTaskArgs({
      description: "Security analyzer for PR diff",
      subagentType: { kind: "custom", name: "ai-code-review-security-analyzer" },
    });
    expect(subagent_type).toBe("ai-code-review-security-analyzer");
    expect(description).toBe("Security analyzer for PR diff");
  });
});

describe("logAgentStreamEvent", () => {
  function captureOutput(fn: () => void): string {
    const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      chunks.push(String(chunk));
      return true;
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    fn();
    return chunks.join("");
  }

  it("forwards assistant text with orchestrator prefix", () => {
    const out = captureOutput(() =>
      logAgentStreamEvent({
        type: "assistant",
        agent_id: "a",
        run_id: "r",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "📋 PR Metadata:\nbranch main" }],
        },
      }),
    );
    expect(out).toContain("[orchestrator]");
    expect(out).toContain("PR Metadata:");
    expect(out).not.toMatch(/\[agent\]/);
  });

  it("ignores tool_use, task, system, status, thinking, non-Task tool_call", () => {
    const noise: SDKMessage[] = [
      {
        type: "assistant",
        agent_id: "a",
        run_id: "r",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "1", name: "Bash", input: {} }],
        },
      },
      {
        type: "tool_call",
        agent_id: "a",
        run_id: "r",
        call_id: "c1",
        name: "Read",
        status: "completed",
      },
      { type: "task", agent_id: "a", run_id: "r", status: "running", text: "x" },
      { type: "system", agent_id: "a", run_id: "r" },
      { type: "status", agent_id: "a", run_id: "r", status: "RUNNING" },
      { type: "thinking", agent_id: "a", run_id: "r", text: "secret thought" },
    ];
    const out = captureOutput(() => {
      for (const event of noise) {
        logAgentStreamEvent(event);
      }
    });
    expect(out).not.toMatch(/\[agent\] (tool_call|tool_use|task)/);
    expect(out).not.toContain("secret thought");
  });

  it("does not log wrapper steps for read/shell tool_call", () => {
    const stepSpy = vi.spyOn(logger, "step").mockImplementation(() => {});
    logAgentStreamEvent({
      type: "tool_call",
      agent_id: "a",
      run_id: "r",
      call_id: "c1",
      name: "read",
      status: "running",
      args: { path: "/repo/.ai-code-review/prepare-diff.json" },
    });
    expect(stepSpy).not.toHaveBeenCalled();
    stepSpy.mockRestore();
  });

  it("emits sub-agent lifecycle for Task tool_call only", () => {
    const launched = vi.spyOn(logger, "subAgentLaunched");
    const done = vi.spyOn(logger, "subAgentDone");
    const tracker = new SubAgentTracker();

    logAgentStreamEvent(
      {
        type: "tool_call",
        agent_id: "a",
        run_id: "r",
        call_id: "call-abc12345",
        name: "task",
        status: "running",
        args: {
          description: "Security analyzer for PR diff",
          subagentType: { kind: "custom", name: "ai-code-review-security-analyzer" },
        },
      },
      tracker,
    );
    logAgentStreamEvent(
      {
        type: "tool_call",
        agent_id: "a",
        run_id: "r",
        call_id: "call-abc12345",
        name: "task",
        status: "completed",
      },
      tracker,
    );

    expect(launched).toHaveBeenCalledWith("Security analyzer for PR diff");
    expect(done).toHaveBeenCalledWith(
      "completed",
      expect.any(Number),
      "Security analyzer for PR diff",
    );
  });

  it("drops lines after Review complete except Report written to", () => {
    const forwarded: string[] = [];
    vi.spyOn(logger, "orchestratorLine").mockImplementation((line) => {
      forwarded.push(line);
    });

    resetOrchestratorStream();
    forwardOrchestratorText("🎯 Review complete: 0 critical, 0 major\n");
    forwardOrchestratorText("---\n");
    forwardOrchestratorText("The incremental diff covered 11 files.\n");
    forwardOrchestratorText("Final report: '.ai-code-review/findings.json'\n");
    forwardOrchestratorText("Report written to: .ai-code-review/2026-05-31T12-00-00-000Z/findings.md\n");
    flushOrchestratorStream();

    expect(forwarded).toHaveLength(2);
    expect(forwarded[0]).toContain("Review complete");
    expect(forwarded[1]).toContain("Report written to:");
  });

  it("forwards orchestrator narration as it streams", () => {
    const out = captureOutput(() => {
      resetOrchestratorStream();
      forwardOrchestratorText("I'll read the skill and run the review.\n");
      forwardOrchestratorText("Launching analyzers.\n");
      flushOrchestratorStream();
    });
    expect(out).toContain("I'll read the skill");
    expect(out).toContain("Launching analyzers");
  });

  it("buffers streaming deltas until newline", () => {
    const out = captureOutput(() => {
      resetOrchestratorStream();
      forwardOrchestratorText("Preparing ");
      forwardOrchestratorText("diff batch.\n");
      flushOrchestratorStream();
    });
    expect(out).toContain("Preparing diff batch.");
  });
});

describe("OrchestratorStreamForwarder", () => {
  it("accumulates chunks without emitting until newline", () => {
    const forwarder = new OrchestratorStreamForwarder();
    const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      chunks.push(String(chunk));
      return true;
    });

    forwarder.append("Preparing ");
    forwarder.append("diff");
    expect(chunks.join("")).toBe("");
    forwarder.append("\n");
    expect(chunks.join("")).toContain("Preparing diff");
    vi.restoreAllMocks();
  });
});
