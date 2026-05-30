import type { SDKMessage } from "@cursor/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SubAgentTracker,
  formatOrchestratorLine,
  forwardOrchestratorText,
  humanSubagentDescription,
  logAgentStreamEvent,
  stripOrchestratorMarkdown,
} from "./agent-stream.js";
import * as logger from "./logger.js";

afterEach(() => {
  vi.restoreAllMocks();
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
        name: "Task",
        status: "running",
        args: { subagent_type: "ai-code-review-security-analyzer", description: "sec" },
      },
      tracker,
    );
    logAgentStreamEvent(
      {
        type: "tool_call",
        agent_id: "a",
        run_id: "r",
        call_id: "call-abc12345",
        name: "Task",
        status: "completed",
      },
      tracker,
    );

    expect(launched).toHaveBeenCalledWith("sec");
    expect(done).toHaveBeenCalledWith(
      "completed",
      expect.any(Number),
      "sec",
    );
  });

  it("forwardOrchestratorText skips empty lines", () => {
    const out = captureOutput(() => forwardOrchestratorText("\n\nline\n"));
    expect(out.split("\n").filter((l) => l.includes("[orchestrator]")).length).toBe(1);
  });
});
