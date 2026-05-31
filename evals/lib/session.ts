import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export type SessionManifest = {
  version: "1";
  sessionDir: string;
  diff: string;
  security: string;
  performance: string;
  raw: string;
  validatorOut: string;
  validatorSummary: string;
};

export function buildSessionManifest(sessionDir: string): SessionManifest {
  const dir = path.resolve(sessionDir);
  return {
    version: "1",
    sessionDir: dir,
    diff: path.join(dir, "diff.json"),
    security: path.join(dir, "security-findings.json"),
    performance: path.join(dir, "performance-findings.json"),
    raw: path.join(dir, "raw-findings.json"),
    validatorOut: path.join(dir, "validator-output.json"),
    validatorSummary: path.join(dir, "validator-summary.json"),
  };
}

export async function writeSessionManifest(
  manifest: SessionManifest,
): Promise<string> {
  const manifestPath = path.join(manifest.sessionDir, "session-manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return manifestPath;
}

export type EvalSession = {
  sessionDir: string;
  manifest: SessionManifest;
  manifestPath: string;
  cleanup: () => Promise<void>;
};

/** Ephemeral IPC dir for eval harness (parity with skill `$TMPDIR/ai-code-review-*`). */
export async function createEvalSession(options?: {
  parentDir?: string;
  reuseDir?: string;
}): Promise<EvalSession> {
  const sessionDir = options?.reuseDir
    ? path.resolve(options.reuseDir)
    : await mkdtemp(
        path.join(options?.parentDir ?? tmpdir(), "ai-code-review-"),
      );

  await mkdir(sessionDir, { recursive: true });
  const manifest = buildSessionManifest(sessionDir);
  const manifestPath = await writeSessionManifest(manifest);

  const previous = process.env.AI_CODE_REVIEW_SESSION_DIR;
  process.env.AI_CODE_REVIEW_SESSION_DIR = sessionDir;

  return {
    sessionDir,
    manifest,
    manifestPath,
    cleanup: async () => {
      if (previous === undefined) {
        delete process.env.AI_CODE_REVIEW_SESSION_DIR;
      } else {
        process.env.AI_CODE_REVIEW_SESSION_DIR = previous;
      }
      if (!options?.reuseDir) {
        await rm(sessionDir, { recursive: true, force: true });
      }
    },
  };
}

export function resolveEvalSessionDir(cwd?: string): string {
  const fromEnv = process.env.AI_CODE_REVIEW_SESSION_DIR;
  if (fromEnv) return path.resolve(fromEnv);
  if (cwd) {
    throw new Error(
      `AI_CODE_REVIEW_SESSION_DIR is not set (cwd=${cwd}). Seed workspace with createEvalSession first.`,
    );
  }
  throw new Error("AI_CODE_REVIEW_SESSION_DIR is not set");
}

export async function readSessionManifest(
  sessionDir: string,
): Promise<SessionManifest> {
  const text = await readFile(
    path.join(sessionDir, "session-manifest.json"),
    "utf8",
  );
  return JSON.parse(text) as SessionManifest;
}
