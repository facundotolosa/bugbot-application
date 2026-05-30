import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SDKMessage } from "@cursor/sdk";
import { humanSubagentDescription, isTaskToolCall, parseTaskArgs } from "./agent-stream.js";

export interface RunArtifactsPayload {
  runId: string;
  modelId: string;
  prompt: string;
  events: SDKMessage[];
  startedAt: string;
  endedAt: string;
}

function slugFromSubagentType(subagentType?: string): string {
  if (!subagentType) {
    return "unknown";
  }
  return subagentType.replace(/^ai-code-review-/, "") || "unknown";
}

export function collectSubagentRecords(
  events: SDKMessage[],
): Array<{
  callId: string;
  slug: string;
  description: string;
  status: string;
  args?: unknown;
  result?: unknown;
}> {
  const byCall = new Map<
    string,
    {
      callId: string;
      slug: string;
      description: string;
      status: string;
      args?: unknown;
      result?: unknown;
    }
  >();

  for (const event of events) {
    if (event.type !== "tool_call" || !isTaskToolCall(event.name)) {
      continue;
    }
    const callId = event.call_id;
    const existing = byCall.get(callId);
    const parsed = parseTaskArgs(event.args);
    const prior = parseTaskArgs(existing?.args);
    const subagentType = parsed.subagent_type ?? prior.subagent_type;
    const description = parsed.description ?? prior.description;
    const slug = existing?.slug ?? slugFromSubagentType(subagentType);
    const label = existing?.description ?? humanSubagentDescription(subagentType, description);
    byCall.set(callId, {
      callId,
      slug,
      description: label,
      status: event.status,
      args: existing?.args ?? event.args,
      result: event.result ?? existing?.result,
    });
  }

  return [...byCall.values()];
}

export async function writeRunArtifacts(
  dir: string,
  payload: RunArtifactsPayload,
): Promise<void> {
  await mkdir(dir, { recursive: true });
  const subagents = collectSubagentRecords(payload.events);

  const manifest = {
    run_id: payload.runId,
    model_id: payload.modelId,
    started_at: payload.startedAt,
    ended_at: payload.endedAt,
    subagents: subagents.map((s) => ({
      call_id: s.callId,
      slug: s.slug,
      description: s.description,
      status: s.status,
    })),
  };

  await writeFile(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  await writeFile(
    join(dir, "orchestrator.json"),
    JSON.stringify(
      {
        prompt: payload.prompt,
        conversation: payload.events,
      },
      null,
      2,
    ),
    "utf8",
  );

  await mkdir(join(dir, "subagents"), { recursive: true });
  for (const sub of subagents) {
    const callId8 = sub.callId.slice(0, 8);
    const fileName = `${sub.slug}-${callId8}.json`;
    await writeFile(
      join(dir, "subagents", fileName),
      JSON.stringify(
        {
          call_id: sub.callId,
          slug: sub.slug,
          description: sub.description,
          status: sub.status,
          args: sub.args,
          result: sub.result,
        },
        null,
        2,
      ),
      "utf8",
    );
  }
}
