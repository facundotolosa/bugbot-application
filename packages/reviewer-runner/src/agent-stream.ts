import type { SDKMessage } from "@cursor/sdk";
import * as log from "./logger.js";

const SUBAGENT_SLUG_LABELS: Record<string, string> = {
  "ai-code-review-security-analyzer": "security analyzer",
  "ai-code-review-performance-analyzer": "performance analyzer",
  "ai-code-review-validator": "validator",
};

export function stripOrchestratorMarkdown(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/```[^\n]*\n?/g, "")
    .replace(/```/g, "");
}

export function formatOrchestratorLine(text: string): string {
  const stripped = stripOrchestratorMarkdown(text);
  return `${log.orchestratorPrefix()}${stripped}`;
}

/** Buffers streaming assistant deltas; emits one prefixed line per completed newline. */
export class OrchestratorStreamForwarder {
  private pending = "";

  reset(): void {
    this.pending = "";
  }

  append(text: string): void {
    this.pending += stripOrchestratorMarkdown(text);
    this.drainCompleteLines();
  }

  flush(): void {
    const rest = this.pending;
    this.pending = "";
    if (rest.trim().length > 0) {
      this.writeLine(rest);
    }
  }

  private drainCompleteLines(): void {
    let newlineAt = this.pending.indexOf("\n");
    while (newlineAt !== -1) {
      const line = this.pending.slice(0, newlineAt);
      this.pending = this.pending.slice(newlineAt + 1);
      this.writeLine(line);
      newlineAt = this.pending.indexOf("\n");
    }
  }

  private writeLine(line: string): void {
    if (line.trim().length === 0) {
      return;
    }
    process.stdout.write(`${log.orchestratorPrefix()}${line}\n`);
  }
}

const streamForwarder = new OrchestratorStreamForwarder();

export function resetOrchestratorStream(): void {
  streamForwarder.reset();
}

export function flushOrchestratorStream(): void {
  streamForwarder.flush();
}

export function forwardOrchestratorText(text: string): void {
  streamForwarder.append(text);
}

export function isTaskToolCall(name: string): boolean {
  return name.toLowerCase() === "task";
}

/** Cursor SDK uses `task` tool with `subagentType.name` (camelCase). */
export function parseTaskArgs(args: unknown): {
  description?: string;
  subagent_type?: string;
} {
  if (!args || typeof args !== "object") {
    return {};
  }
  const record = args as Record<string, unknown>;
  let subagent_type: string | undefined;
  if (typeof record.subagent_type === "string") {
    subagent_type = record.subagent_type;
  } else if (record.subagentType && typeof record.subagentType === "object") {
    const nested = record.subagentType as Record<string, unknown>;
    if (typeof nested.name === "string") {
      subagent_type = nested.name;
    }
  }
  return {
    description: typeof record.description === "string" ? record.description : undefined,
    subagent_type,
  };
}

export function humanSubagentDescription(
  subagentType?: string,
  description?: string,
): string {
  if (description?.trim()) {
    return description.trim();
  }
  if (subagentType && SUBAGENT_SLUG_LABELS[subagentType]) {
    return SUBAGENT_SLUG_LABELS[subagentType];
  }
  if (subagentType) {
    return subagentType.replace(/^ai-code-review-/, "").replace(/-/g, " ");
  }
  return "sub-agent";
}

export class SubAgentTracker {
  private readonly starts = new Map<string, { at: number; description: string }>();
  private readonly finished = new Set<string>();

  handleToolCall(event: Extract<SDKMessage, { type: "tool_call" }>): void {
    if (!isTaskToolCall(event.name)) {
      return;
    }
    const { description, subagent_type: subagentType } = parseTaskArgs(event.args);
    const label = humanSubagentDescription(subagentType, description);

    if (event.status === "running") {
      if (this.starts.has(event.call_id)) {
        return;
      }
      this.starts.set(event.call_id, { at: Date.now(), description: label });
      log.subAgentLaunched(label);
      return;
    }

    if (event.status !== "completed" && event.status !== "error") {
      return;
    }
    if (this.finished.has(event.call_id)) {
      return;
    }
    this.finished.add(event.call_id);

    const started = this.starts.get(event.call_id);
    const elapsedSec = started ? (Date.now() - started.at) / 1000 : 0;
    const finalLabel = started?.description ?? label;
    this.starts.delete(event.call_id);
    log.subAgentDone(
      event.status === "error" ? "error" : "completed",
      elapsedSec,
      finalLabel,
    );
  }
}

const defaultTracker = new SubAgentTracker();

/** Stream orchestrator assistant text; derive sub-agent lifecycle from Task tool_call events. */
export function logAgentStreamEvent(
  event: SDKMessage,
  tracker: SubAgentTracker = defaultTracker,
): void {
  switch (event.type) {
    case "assistant":
      for (const block of event.message.content) {
        if (block.type === "text" && block.text) {
          forwardOrchestratorText(block.text);
        }
      }
      break;
    case "tool_call":
      tracker.handleToolCall(event);
      break;
    default:
      break;
  }
}
