import { setMaxListeners } from "node:events";
import { stripAnsi } from "./logger.js";

export const MAX_LISTENERS_WARNING =
  /MaxListenersExceededWarning[\s\S]*AbortSignal/;

/** Cursor SDK local agent bootstrap (rules/skills load) — noisy in CI, not actionable. */
export const SDK_INFO_LOAD_LINE =
  /^\d{1,2}:\d{2}:\d{2}(?:\.\d{1,3})?\s+INFO\s+\S+\s+load completed\b/;

function normalizeNoiseLine(line: string): string {
  return stripAnsi(line).trim();
}

export function shouldSuppressProcessNoise(text: string): boolean {
  if (MAX_LISTENERS_WARNING.test(text)) {
    return true;
  }
  const lines = text.split("\n").filter((line) => normalizeNoiseLine(line).length > 0);
  if (lines.length === 0) {
    return false;
  }
  return lines.every((line) => SDK_INFO_LOAD_LINE.test(normalizeNoiseLine(line)));
}

/**
 * Remove SDK bootstrap INFO lines from a write chunk. Returns `null` when the whole chunk
 * should be dropped (warnings or only bootstrap lines).
 */
export function stripSdkBootstrapNoise(text: string): string | null {
  if (MAX_LISTENERS_WARNING.test(text)) {
    return null;
  }
  const lines = text.split("\n");
  const kept: string[] = [];
  let stripped = false;
  for (const line of lines) {
    if (SDK_INFO_LOAD_LINE.test(normalizeNoiseLine(line))) {
      stripped = true;
      continue;
    }
    kept.push(line);
  }
  if (!stripped) {
    return text;
  }
  const out = kept.join("\n");
  return out.trim().length > 0 ? out : null;
}

function patchStreamWrite(
  original: typeof process.stderr.write,
): typeof process.stderr.write {
  return ((chunk, encoding?, cb?) => {
    const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    const filtered = stripSdkBootstrapNoise(text);
    if (filtered === null) {
      if (typeof encoding === "function") {
        encoding();
      } else if (typeof cb === "function") {
        cb();
      }
      return true;
    }
    return original(filtered, encoding as never, cb as never);
  }) as typeof process.stderr.write;
}

/** SDK parallel Tasks attach many abort listeners; raise default and hide known noise in CI logs. */
export function installProcessGuards(): void {
  setMaxListeners(32);

  const originalEmitWarning = process.emitWarning.bind(process);
  process.emitWarning = ((warning: unknown, ...args: unknown[]) => {
    const text =
      typeof warning === "string"
        ? warning
        : warning instanceof Error
          ? warning.message
          : String(warning);
    if (shouldSuppressProcessNoise(text)) {
      return;
    }
    return originalEmitWarning(warning as never, ...(args as never[]));
  }) as typeof process.emitWarning;

  process.stderr.write = patchStreamWrite(process.stderr.write.bind(process.stderr));
  process.stdout.write = patchStreamWrite(process.stdout.write.bind(process.stdout));
}
