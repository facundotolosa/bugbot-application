import { setMaxListeners } from "node:events";

export const MAX_LISTENERS_WARNING =
  /MaxListenersExceededWarning[\s\S]*AbortSignal/;

export function shouldSuppressProcessNoise(text: string): boolean {
  return MAX_LISTENERS_WARNING.test(text);
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

  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk, encoding?, cb?) => {
    const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    if (shouldSuppressProcessNoise(text)) {
      if (typeof encoding === "function") {
        encoding();
      } else if (typeof cb === "function") {
        cb();
      }
      return true;
    }
    return originalStderrWrite(chunk, encoding as never, cb as never);
  }) as typeof process.stderr.write;
}
