import type { SDKMessage } from "@cursor/sdk";
import * as log from "../support/logger.js";

/** Canonical skill start line — drop paraphrased duplicates from agent narration. */
export const ORCHESTRATOR_START_LINE =
  "I'll run the ai-code-review skill with the PR parameters from the prompt.";

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

export function isReviewCompleteLine(line: string): boolean {
  return /^🎯\s*Review complete:/u.test(line.trim());
}

/** Forward orchestrator assistant narration; drop empty lines and TodoWrite noise only. */
export function shouldForwardOrchestratorLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  if (/^(- \[[ x]\] )?(prereq|metadata|diff|analyzers|collect|validate|report)\b/i.test(trimmed)) {
    return false;
  }
  // Markdown findings tables render poorly in CI logs; details belong in findings.json.
  if (/^\|.*\|$/.test(trimmed)) {
    return false;
  }
  // Funnel counts are in the ✅ block; filter_summary is in validator-summary.json.
  if (/^Validator funnel:/i.test(trimmed)) {
    return false;
  }
  if (/ai-code-review skill/i.test(trimmed) && trimmed !== ORCHESTRATOR_START_LINE) {
    return false;
  }
  if (/^-{3,}\s*$/.test(trimmed)) {
    return false;
  }
  if (/^Final report:/i.test(trimmed) || /Session artifacts were saved/i.test(trimmed)) {
    return false;
  }
  return true;
}

type OrchestratorNarrationPhase = "open" | "after_review_complete" | "closed";

function shouldForwardInPhase(line: string, phase: OrchestratorNarrationPhase): boolean {
  const trimmed = line.trim();
  if (phase === "closed") {
    return false;
  }
  if (phase === "after_review_complete") {
    return /^Report written to:/i.test(trimmed);
  }
  return shouldForwardOrchestratorLine(line);
}

/** Buffers streaming assistant deltas; emits one styled line per completed newline. */
export class OrchestratorStreamForwarder {
  private pending = "";
  private phase: OrchestratorNarrationPhase = "open";

  reset(): void {
    this.pending = "";
    this.phase = "open";
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
    if (!shouldForwardInPhase(line, this.phase)) {
      return;
    }
    log.orchestratorLine(line);
    const trimmed = line.trim();
    if (isReviewCompleteLine(trimmed)) {
      this.phase = "after_review_complete";
    } else if (/^Report written to:/i.test(trimmed)) {
      this.phase = "closed";
    }
  }
}

const streamForwarder = new OrchestratorStreamForwarder();

export function resetOrchestratorStream(): void {
  streamForwarder.reset();
  resetDefaultTracker();
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

  reset(): void {
    this.starts.clear();
    this.finished.clear();
  }

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

function resetDefaultTracker(): void {
  defaultTracker.reset();
}

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
