import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SDKMessage } from "@cursor/sdk";
import { describe, expect, it } from "vitest";
import { collectSubagentRecords, writeRunArtifacts } from "./run-artifacts.js";

const events: SDKMessage[] = [
  { type: "system", agent_id: "a1", run_id: "run-1" },
  {
    type: "tool_call",
    agent_id: "a1",
    run_id: "run-1",
    call_id: "call-abcd1234",
    name: "task",
    status: "running",
    args: {
      description: "security pass",
      subagentType: { kind: "custom", name: "ai-code-review-security-analyzer" },
    },
  },
  {
    type: "tool_call",
    agent_id: "a1",
    run_id: "run-1",
    call_id: "call-abcd1234",
    name: "task",
    status: "completed",
    result: { ok: true },
  },
];

describe("run-artifacts", () => {
  it("collects Task subagent records", () => {
    const subs = collectSubagentRecords(events);
    expect(subs).toHaveLength(1);
    expect(subs[0]?.slug).toBe("security-analyzer");
    expect(subs[0]?.status).toBe("completed");
  });

  it("writes manifest, orchestrator, and subagent files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "run-artifacts-"));
    await writeRunArtifacts(dir, {
      runId: "run-1",
      modelId: "composer-2.5",
      prompt: "review this",
      events,
      startedAt: "2026-05-30T00:00:00.000Z",
      endedAt: "2026-05-30T00:01:00.000Z",
    });

    const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
    expect(manifest.run_id).toBe("run-1");
    expect(manifest.model_id).toBe("composer-2.5");
    expect(manifest.subagents).toHaveLength(1);

    const orchestrator = JSON.parse(await readFile(join(dir, "orchestrator.json"), "utf8"));
    expect(orchestrator.prompt).toBe("review this");
    expect(orchestrator.conversation).toHaveLength(3);

    const subPath = join(dir, "subagents", "security-analyzer-call-abc.json");
    const sub = JSON.parse(await readFile(subPath, "utf8"));
    expect(sub.call_id).toBe("call-abcd1234");
    expect(sub.result).toEqual({ ok: true });
  });
});
