import fs from "node:fs/promises";
import path from "node:path";

import { EVALS_ROOT, getOutDir } from "../config.js";
import { DURABLE_PATHS } from "./invocation.js";
import { createEvalSession, type SessionManifest } from "./session.js";

const INPUT_DEST = (manifest: SessionManifest): Record<string, string> => ({
  "diff.json": manifest.diff,
  "security-findings.json": manifest.security,
  "performance-findings.json": manifest.performance,
  "raw-findings.json": manifest.raw,
  "validator-output.json": manifest.validatorOut,
  "known-issues.json": DURABLE_PATHS.knownIssues,
  "findings.json": DURABLE_PATHS.findings,
  "pr-files.txt": ".ai-code-review/pr-files.txt",
});

/** Copied into case `inputs/` only for `--refresh-inputs`; not seeded into the workspace. */
const INPUT_SKIP = new Set(["diff-refs.json"]);

export type SeedWorkspaceOptions = {
  caseDir: string;
  caseId: string;
  /** Defaults to `caseId` under `evals/fixtures/`. */
  fixtureId?: string;
  runId?: string;
};

export type SeededWorkspace = {
  cwd: string;
  sessionDir: string;
  manifest: SessionManifest;
  cleanup: () => Promise<void>;
};

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveFixtureSource(
  caseDir: string,
  fixtureId: string,
): Promise<string> {
  const fromFixtures = path.join(EVALS_ROOT, "fixtures", fixtureId);
  if (await pathExists(fromFixtures)) return fromFixtures;

  const fromCase = path.join(caseDir, "fixture");
  if (await pathExists(fromCase)) return fromCase;

  throw new Error(
    `No fixture found for case (tried evals/fixtures/${fixtureId} and ${caseDir}/fixture)`,
  );
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  await fs.cp(src, dest, { recursive: true });
}

export async function seedWorkspace(
  options: SeedWorkspaceOptions,
): Promise<SeededWorkspace> {
  const fixtureId = options.fixtureId ?? options.caseId;
  const fixtureSource = await resolveFixtureSource(options.caseDir, fixtureId);

  const runSegment = options.runId ?? "workspace";
  const parent = path.join(getOutDir(), runSegment);
  await fs.mkdir(parent, { recursive: true });

  const cwd = await fs.mkdtemp(path.join(parent, `${options.caseId}-`));
  await copyDir(fixtureSource, cwd);

  const session = await createEvalSession();
  const destMap = INPUT_DEST(session.manifest);

  const inputsDir = path.join(options.caseDir, "inputs");
  if (await pathExists(inputsDir)) {
    const files = await fs.readdir(inputsDir);
    for (const file of files) {
      if (INPUT_SKIP.has(file)) continue;
      const destRel = destMap[file];
      if (!destRel) {
        throw new Error(`Unknown input file "${file}" in ${inputsDir}`);
      }
      const dest = path.isAbsolute(destRel)
        ? destRel
        : path.join(cwd, destRel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(path.join(inputsDir, file), dest);
    }
  }

  return {
    cwd,
    sessionDir: session.sessionDir,
    manifest: session.manifest,
    cleanup: async () => {
      await session.cleanup();
      await fs.rm(cwd, { recursive: true, force: true });
    },
  };
}
