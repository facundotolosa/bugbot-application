import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prompt: vi.fn(),
  step: vi.fn(),
  ok: vi.fn(),
  logAgentStreamEvent: vi.fn(),
  flushOrchestratorStream: vi.fn(),
  resetOrchestratorStream: vi.fn(),
  parseFindingsFile: vi.fn().mockResolvedValue({ version: 2, findings: [] }),
  writeRunArtifacts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../support/logger.js", () => ({
  prompt: mocks.prompt,
  step: mocks.step,
  ok: mocks.ok,
}));

vi.mock("./agent-stream.js", () => ({
  logAgentStreamEvent: mocks.logAgentStreamEvent,
  flushOrchestratorStream: mocks.flushOrchestratorStream,
  resetOrchestratorStream: mocks.resetOrchestratorStream,
}));

vi.mock("../findings/findings.js", () => ({
  parseFindingsFile: mocks.parseFindingsFile,
}));

vi.mock("./run-artifacts.js", () => ({
  writeRunArtifacts: mocks.writeRunArtifacts,
}));

vi.mock("../paths/review-run-dir.js", () => ({
  createReviewRunDir: vi.fn().mockResolvedValue("/repo/.ai-code-review/run"),
  findingsPathInRun: (dir: string) => `${dir}/findings.json`,
  findingsReportRelativePath: () => "findings.json",
  runArtifactsDirInRun: (dir: string) => `${dir}/run-artifacts`,
  REVIEW_RUN_FILES: {},
}));

vi.mock("@cursor/sdk", () => {
  const event = { role: "assistant", content: "hi" };
  return {
    Agent: {
      create: vi.fn().mockImplementation(async () => ({
        agentId: "agent-1",
        send: vi.fn().mockImplementation(async () => ({
          id: "run-1",
          stream: async function* () {
            yield event;
          },
          wait: vi.fn().mockResolvedValue({ status: "completed", durationMs: 50 }),
        })),
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      })),
    },
    CursorAgentError: class extends Error {},
  };
});

import { runReviewAgent } from "./agent.js";

const BASE_OPTIONS = {
  apiKey: "test-key",
  repoRoot: "/repo",
  sourceRef: "a".repeat(40),
  targetRef: "main",
  headSha: "b".repeat(40),
  reviewRunDir: "/repo/.ai-code-review/run",
  prompt: "E2E eval test prompt",
};

describe("runReviewAgent logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("suppresses prompt, step, ok, and stream logging when logging is quiet", async () => {
    await runReviewAgent({ ...BASE_OPTIONS, logging: "quiet" });

    expect(mocks.prompt).not.toHaveBeenCalled();
    expect(mocks.step).not.toHaveBeenCalled();
    expect(mocks.ok).not.toHaveBeenCalled();
    expect(mocks.logAgentStreamEvent).not.toHaveBeenCalled();
    expect(mocks.flushOrchestratorStream).not.toHaveBeenCalled();
    expect(mocks.writeRunArtifacts).toHaveBeenCalled();
  });

  it("logs prompt, step, ok, and stream when logging is default or omitted", async () => {
    await runReviewAgent({ ...BASE_OPTIONS });

    expect(mocks.prompt).toHaveBeenCalled();
    expect(mocks.step).toHaveBeenCalled();
    expect(mocks.ok).toHaveBeenCalled();
    expect(mocks.logAgentStreamEvent).toHaveBeenCalled();
    expect(mocks.flushOrchestratorStream).toHaveBeenCalled();
  });

  it("logs when logging is explicitly default", async () => {
    await runReviewAgent({ ...BASE_OPTIONS, logging: "default" });

    expect(mocks.prompt).toHaveBeenCalled();
    expect(mocks.logAgentStreamEvent).toHaveBeenCalled();
  });
});
