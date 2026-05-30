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

function parseTaskArgs(args: unknown): {
  description?: string;
  subagent_type?: string;
} {
  if (!args || typeof args !== "object") {
    return {};
  }
  const record = args as Record<string, unknown>;
  return {
    description: typeof record.description === "string" ? record.description : undefined,
    subagent_type:
      typeof record.subagent_type === "string" ? record.subagent_type : undefined,
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

  handleToolCall(event: Extract<SDKMessage, { type: "tool_call" }>): void {
    if (event.name !== "Task") {
      return;
    }
    const { description, subagent_type: subagentType } = parseTaskArgs(event.args);
    const label = humanSubagentDescription(subagentType, description);

    if (event.status === "running") {
      this.starts.set(event.call_id, { at: Date.now(), description: label });
      log.subAgentLaunched(label);
      return;
    }

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

export function forwardOrchestratorText(text: string): void {
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.length === 0) {
      continue;
    }
    process.stdout.write(`${formatOrchestratorLine(line)}\n`);
  }
}
