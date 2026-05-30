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

/** Prescribed skill stdout only — drops monologues and narration. */
export function shouldForwardOrchestratorLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  if (/^(📋|📊|🔬|📥|⏭️|✅|🎯)/.test(trimmed)) {
    return true;
  }
  if (/^(Analyzers:|Validator funnel:|Report written to:|Warning:)/i.test(trimmed)) {
    return true;
  }
  if (/^\s{2,}\S/.test(line)) {
    return true;
  }
  return false;
}

/** Buffers streaming assistant deltas; emits one styled line per completed newline. */
export class OrchestratorStreamForwarder {
  private pending = "";
  private readonly seenLines = new Set<string>();

  reset(): void {
    this.pending = "";
    this.seenLines.clear();
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
    if (!shouldForwardOrchestratorLine(line)) {
      return;
    }
    const key = line.trim();
    if (this.seenLines.has(key)) {
      return;
    }
    this.seenLines.add(key);
    log.orchestratorLine(line);
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

function basenamePath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? path;
}

/** Human step from orchestrator SDK tool_call (not sub-agent Tasks). */
export function describeOrchestratorToolProgress(
  toolName: string,
  args: unknown,
): string | null {
  if (!args || typeof args !== "object") {
    return null;
  }
  const record = args as Record<string, unknown>;
  const name = toolName.toLowerCase();

  if (name === "read") {
    const path = typeof record.path === "string" ? record.path : "";
    const base = basenamePath(path);
    if (base.includes("SKILL.md")) {
      return "Reading ai-code-review skill";
    }
    if (base.includes("prepare-diff.json")) {
      return "Reading prepare-diff output";
    }
    if (base.includes("raw-findings.json")) {
      return "Reading raw analyzer findings";
    }
    if (base.includes("validator-output.json")) {
      return "Reading validator output";
    }
    if (base.includes("security-findings") || base.includes("performance-findings")) {
      return `Reading ${base}`;
    }
    if (base) {
      return `Reading ${base}`;
    }
    return "Reading file";
  }

  if (name === "shell") {
    const cmd = typeof record.command === "string" ? record.command : "";
    if (cmd.includes("prepare-diff")) {
      return "Running prepare-diff";
    }
    if (cmd.includes("merge-findings") || cmd.includes("mergeAnalyzerOutputs")) {
      return "Merging analyzer outputs";
    }
    if (
      cmd.includes("validator-output") ||
      cmd.includes("mapValidatorToFindingsReport") ||
      cmd.includes("parseValidatorOutput")
    ) {
      return "Running validator funnel";
    }
    if (cmd.includes("work/diff.json") || cmd.includes("diff.json")) {
      return "Writing work/diff.json";
    }
    if (cmd.includes("raw-findings.json")) {
      return "Writing raw findings";
    }
    if (cmd.includes("findings.json")) {
      return "Writing findings.json";
    }
    if (cmd.includes("select-analyzers") || cmd.includes("selectAnalyzers")) {
      return "Selecting analyzers";
    }
    return "Running orchestrator script";
  }

  if (name === "write" || name === "edit") {
    const path =
      typeof record.path === "string"
        ? record.path
        : typeof record.file_path === "string"
          ? record.file_path
          : "";
    const base = basenamePath(path);
    if (base.includes("diff.json")) {
      return "Writing work/diff.json";
    }
    if (base.includes("findings.json")) {
      return "Writing findings.json";
    }
    if (base) {
      return `Writing ${base}`;
    }
  }

  return null;
}

export class OrchestratorProgressTracker {
  private readonly running = new Set<string>();

  reset(): void {
    this.running.clear();
  }

  handleToolCall(event: Extract<SDKMessage, { type: "tool_call" }>): void {
    if (isTaskToolCall(event.name)) {
      return;
    }
    if (event.status !== "running") {
      return;
    }
    if (this.running.has(event.call_id)) {
      return;
    }
    this.running.add(event.call_id);

    const message = describeOrchestratorToolProgress(event.name, event.args);
    if (message) {
      log.step(message);
    }
  }
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
const defaultProgressTracker = new OrchestratorProgressTracker();

function resetDefaultTracker(): void {
  defaultTracker.reset();
  defaultProgressTracker.reset();
}

/** Stream orchestrator assistant text; derive sub-agent lifecycle from Task tool_call events. */
export function logAgentStreamEvent(
  event: SDKMessage,
  tracker: SubAgentTracker = defaultTracker,
  progressTracker: OrchestratorProgressTracker = defaultProgressTracker,
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
      progressTracker.handleToolCall(event);
      tracker.handleToolCall(event);
      break;
    default:
      break;
  }
}
