import { stderr, stdout } from "node:process";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const WHITE = "\x1b[37m";

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

export function green(text: string, enabled: boolean = shouldUseColor()): string {
  return fmt(enabled, GREEN, text);
}

export function red(text: string, enabled: boolean = shouldUseColor()): string {
  return fmt(enabled, RED, text);
}

export function bold(text: string, enabled: boolean = shouldUseColor()): string {
  return fmt(enabled, BOLD, text);
}

export function shouldUseColor(
  env: NodeJS.ProcessEnv = process.env,
  isTTY: boolean = stdout.isTTY === true,
): boolean {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") {
    return false;
  }
  const force = env.FORCE_COLOR;
  if (force !== undefined && force !== "" && force !== "0") {
    return true;
  }
  return isTTY;
}

function colorize(enabled: boolean, ...parts: string[]): string {
  if (!enabled) {
    return parts.filter((p) => !p.startsWith("\x1b")).join("");
  }
  return parts.join("");
}

function writeln(stream: NodeJS.WriteStream, line: string): void {
  stream.write(`${line}\n`);
}

function fmt(enabled: boolean, open: string, text: string, close = RESET): string {
  return enabled ? `${open}${text}${close}` : text;
}

export function header(title: string): void {
  const c = shouldUseColor();
  const rule = "─".repeat(Math.max(40, title.length + 4));
  const banner = ` ${title} `;
  writeln(
    stdout,
    colorize(
      c,
      fmt(c, BOLD + CYAN, rule),
      fmt(c, BOLD + CYAN, banner),
      fmt(c, BOLD + CYAN, rule),
    ),
  );
}

export function section(title: string): void {
  const c = shouldUseColor();
  const line = `── ${title} ──`;
  writeln(stdout, fmt(c, CYAN, line));
}

export function meta(label: string, value: string): void {
  const c = shouldUseColor();
  const padded = label.padEnd(12);
  writeln(
    stdout,
    `  ${fmt(c, DIM, padded)} ${fmt(c, WHITE, value)}`,
  );
}

export function step(msg: string): void {
  const c = shouldUseColor();
  writeln(stdout, `${fmt(c, CYAN, "›")} ${msg}`);
}

export function ok(msg: string): void {
  const c = shouldUseColor();
  writeln(stdout, `${fmt(c, GREEN, "✔")} ${msg}`);
}

export function warn(msg: string): void {
  const c = shouldUseColor();
  writeln(stderr, `${fmt(c, YELLOW, "⚠")} ${msg}`);
}

export function error(msg: string): void {
  const c = shouldUseColor();
  writeln(stderr, `${fmt(c, RED, "✗")} ${msg}`);
}

export function done(msg: string): void {
  const c = shouldUseColor();
  writeln(stdout, `${fmt(c, BOLD + GREEN, msg)}`);
}

export interface PromptMeta {
  chars: number;
  knownIssues: number;
}

export function prompt(text: string, meta: PromptMeta): void {
  const c = shouldUseColor();
  const border = "─".repeat(68);
  writeln(stdout, "");
  writeln(stdout, fmt(c, BOLD + CYAN, "Prompt"));
  writeln(
    stdout,
    fmt(c, DIM, `  ${meta.chars} chars · ${meta.knownIssues} known issue(s)`),
  );
  writeln(stdout, fmt(c, CYAN, border));

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed === "Parameters:") {
      writeln(stdout, fmt(c, BOLD, "  Parameters"));
      continue;
    }
    const param = /^([A-Za-z][^:]*):\s*(.*)$/.exec(trimmed);
    if (param) {
      const [, label, value] = param;
      writeln(
        stdout,
        `    ${fmt(c, DIM, `${label}:`)} ${fmt(c, WHITE, value)}`,
      );
      continue;
    }
    writeln(stdout, `  ${fmt(c, DIM, trimmed)}`);
  }

  writeln(stdout, fmt(c, CYAN, border));
  writeln(stdout, "");
}

export interface ReviewOutcome {
  mode: string;
  findings: string | number;
  posted: number;
  dropped?: number;
  tracking?: string | number;
}

/** Single post-run line (replaces verbose step/meta/summary + done). */
export function reviewOutcome(
  status: "complete" | "skipped",
  outcome: ReviewOutcome,
): void {
  const c = shouldUseColor();
  const parts = [
    fmt(c, DIM, outcome.mode),
    fmt(c, WHITE, `${outcome.findings} findings`),
    fmt(c, WHITE, `${outcome.posted} posted`),
  ];
  if (outcome.dropped != null && outcome.dropped > 0) {
    parts.push(fmt(c, WHITE, `${outcome.dropped} dropped`));
  }
  if (outcome.tracking != null) {
    parts.push(fmt(c, WHITE, `tracking ${outcome.tracking}`));
  }
  const label = status === "skipped" ? "Review skipped" : "Review complete";
  writeln(
    stdout,
    `${fmt(c, GREEN, "✔")} ${fmt(c, BOLD, label)} — ${parts.join(fmt(c, DIM, " · "))}`,
  );
}

export function blank(): void {
  writeln(stdout, "");
}

export function subAgentLaunched(description: string): void {
  const c = shouldUseColor();
  writeln(
    stdout,
    `  ${fmt(c, CYAN, "›")} ${fmt(c, BOLD, "[sub-agent]")} ${fmt(c, BOLD, "Launched:")} ${fmt(c, WHITE, description)}`,
  );
}

export function subAgentDone(
  state: "completed" | "error",
  elapsedSec: number,
  description: string,
): void {
  const c = shouldUseColor();
  const glyph = state === "completed" ? fmt(c, GREEN, "✔") : fmt(c, RED, "✗");
  const label = state === "completed" ? "Completed" : "Failed";
  writeln(
    stdout,
    `  ${glyph} ${fmt(c, BOLD, "[sub-agent]")} ${fmt(c, BOLD, `${label}`)} ${fmt(c, DIM, `(${elapsedSec.toFixed(1)}s)`)}: ${fmt(c, WHITE, description)}`,
  );
}

export function orchestratorPrefix(): string {
  const c = shouldUseColor();
  return fmt(c, BOLD + CYAN, "[orchestrator] ");
}

function parseEmojiOrchestratorBlock(
  line: string,
): { emoji: string; title: string; body: string } | null {
  const match = /^((?:\p{Extended_Pictographic}\uFE0F?)+)\s+([^:]+):\s*(.*)$/u.exec(
    line.trimStart(),
  );
  if (!match) {
    return null;
  }
  return { emoji: match[1], title: match[2].trim(), body: match[3] };
}

/** Styled orchestrator stdout line — only `[orchestrator]` is colored; titles bold, body plain. */
export function orchestratorLine(rawLine: string): void {
  const c = shouldUseColor();
  const line = rawLine.trimEnd();
  const prefix = orchestratorPrefix();

  const emojiBlock = parseEmojiOrchestratorBlock(line);
  if (emojiBlock) {
    const { emoji, title, body } = emojiBlock;
    const titlePart = fmt(c, BOLD, `${title}:`);
    const suffix = body.length > 0 ? ` ${body}` : "";
    writeln(stdout, `${prefix}${emoji} ${titlePart}${suffix}`);
    return;
  }

  const detail = /^(\s{2,})([a-zA-Z][^:]*):\s*(.*)$/.exec(line);
  if (detail) {
    const [, indent, label, value] = detail;
    writeln(stdout, `${prefix}${indent}${fmt(c, BOLD, `${label}:`)} ${value}`);
    return;
  }

  if (/^Analyzers:/i.test(line)) {
    writeln(
      stdout,
      `${prefix}${fmt(c, BOLD, "Analyzers:")}${line.slice("Analyzers:".length)}`,
    );
    return;
  }

  if (/^Warning:/i.test(line)) {
    writeln(stdout, `${prefix}${fmt(c, YELLOW, "Warning:")}${line.slice("Warning:".length)}`);
    return;
  }

  if (/^Report written to:/i.test(line)) {
    writeln(
      stdout,
      `${prefix}${fmt(c, BOLD, "Report written to:")}${line.slice("Report written to:".length)}`,
    );
    return;
  }

  writeln(stdout, `${prefix}${line.trimStart()}`);
}
