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
    `  ${fmt(c, DIM, padded)}${fmt(c, WHITE, value)}`,
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
  const metaLine = `${meta.chars} chars · ${meta.knownIssues} known issue(s)`;
  const border = "─".repeat(72);
  writeln(stdout, fmt(c, CYAN, border));
  for (const line of text.split("\n")) {
    writeln(stdout, fmt(c, CYAN, `│ ${line}`));
  }
  writeln(stdout, fmt(c, CYAN, border));
  writeln(stdout, fmt(c, DIM, metaLine));
}

export function summary(fields: Record<string, string | number>): void {
  const c = shouldUseColor();
  writeln(stdout, fmt(c, BOLD, "Review Summary"));
  const labels = Object.keys(fields);
  const width = Math.max(...labels.map((l) => l.length), 8);
  for (const [label, value] of Object.entries(fields)) {
    const padded = label.padEnd(width);
    writeln(
      stdout,
      `  ${fmt(c, DIM, padded)}  ${fmt(c, WHITE, String(value))}`,
    );
  }
}

export function subAgentLaunched(description: string): void {
  const c = shouldUseColor();
  writeln(
    stdout,
    `  ${fmt(c, CYAN, "›")} ${subAgentLabel()} ${fmt(c, BOLD, "Launched:")} ${description}`,
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
    `  ${glyph} ${subAgentLabel()} ${fmt(c, BOLD, `${label}`)} (${elapsedSec.toFixed(1)}s): ${description}`,
  );
}

export function orchestratorPrefix(): string {
  const c = shouldUseColor();
  return fmt(c, DIM + CYAN, "[orchestrator] ");
}

/** Styled orchestrator stdout line (headers/machine lines bold; detail dim). */
export function orchestratorLine(text: string): void {
  const c = shouldUseColor();
  const trimmed = text.trimEnd();
  const prefix = orchestratorPrefix();
  if (/^(📋|📊|🔬|📥|⏭️|✅|🎯)/.test(trimmed)) {
    writeln(stdout, `${prefix}${fmt(c, BOLD, trimmed)}`);
    return;
  }
  if (/^(Analyzers:|Validator funnel:|Report written to:|Warning:)/.test(trimmed)) {
    writeln(stdout, `${prefix}${fmt(c, BOLD, trimmed)}`);
    return;
  }
  if (/^  \S/.test(trimmed)) {
    writeln(stdout, `${prefix}${fmt(c, DIM, trimmed)}`);
    return;
  }
  writeln(stdout, `${prefix}${trimmed}`);
}

export function subAgentLabel(): string {
  const c = shouldUseColor();
  return fmt(c, BOLD, "[sub-agent]");
}
