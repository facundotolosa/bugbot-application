import { EventEmitter } from "node:events";

/** Cursor SDK spawns parallel tasks that attach many AbortSignal listeners. */
EventEmitter.defaultMaxListeners = 32;

const stderrWrite = process.stderr.write.bind(process.stderr);

process.stderr.write = (
  chunk: string | Uint8Array,
  encodingOrCb?: BufferEncoding | ((err?: Error | null) => void),
  cb?: (err?: Error | null) => void,
): boolean => {
  const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
  if (text.includes("MaxListenersExceededWarning")) {
    if (typeof encodingOrCb === "function") {
      encodingOrCb();
    } else if (cb) {
      cb();
    }
    return true;
  }
  return stderrWrite(chunk, encodingOrCb as BufferEncoding, cb);
};
