import type { SDKMessage } from "@cursor/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OrchestratorStreamForwarder,
  SubAgentTracker,
  flushOrchestratorStream,
  formatOrchestratorLine,
  forwardOrchestratorText,
  humanSubagentDescription,
  isPrescribedOrchestratorLine,
  logAgentStreamEvent,
  parseTaskArgs,
  resetOrchestratorStream,
  stripOrchestratorMarkdown,
} from "./agent-stream.js";
import * as logger from "./logger.js";

afterEach(() => {
  resetOrchestratorStream();
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

describe("isPrescribedOrchestratorLine", () => {
  it("allows emoji blocks, machine lines, and indented detail", () => {
    expect(isPrescribedOrchestratorLine("📋 PR Metadata:")).toBe(true);
    expect(isPrescribedOrchestratorLine("Analyzers: security, performance")).toBe(true);
    expect(isPrescribedOrchestratorLine("  source: main")).toBe(true);
    expect(isPrescribedOrchestratorLine("Voy a leer la skill")).toBe(false);
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

  it("forwardOrchestratorText skips empty lines", () => {
    const out = captureOutput(() => {
      resetOrchestratorStream();
      forwardOrchestratorText("\n\nReport written to: .ai-code-review/findings.json\n");
      flushOrchestratorStream();
    });
    expect(out.split("\n").filter((l) => l.includes("[orchestrator]")).length).toBe(1);
  });

  it("buffers streaming deltas and drops non-prescribed narration", () => {
    const out = captureOutput(() => {
      resetOrchestratorStream();
      forwardOrchestratorText("Voy a le");
      forwardOrchestratorText("er las instrucciones\n");
      forwardOrchestratorText("Analyzers: security, performance\n");
      flushOrchestratorStream();
    });
    expect(out).not.toContain("Voy a leer");
    expect(out).toContain("Analyzers: security, performance");
  });

  it("dedupes identical prescribed lines", () => {
    const out = captureOutput(() => {
      resetOrchestratorStream();
      forwardOrchestratorText("📋 PR Metadata:\n  source: main\n");
      forwardOrchestratorText("📋 PR Metadata:\n  source: main\n");
      flushOrchestratorStream();
    });
    const metadataHeaders = out.split("\n").filter((l) => l.includes("PR Metadata"));
    expect(metadataHeaders).toHaveLength(1);
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

    forwarder.append("Analyzers: hel");
    forwarder.append("lo\n");
    expect(chunks.join("")).toContain("Analyzers: hello");
    forwarder.append("Report written to: out.json");
    forwarder.flush();
    expect(chunks.join("")).toContain("Report written to:");
    vi.restoreAllMocks();
  });
});
