import fs from "node:fs/promises";
import path from "node:path";

import { EVALS_ROOT, getOutDir } from "../config.js";
import { PATHS, WORK_DIR } from "./invocation.js";

const INPUT_DEST: Record<string, string> = {
  "diff.json": PATHS.diff,
  "security-findings.json": PATHS.securityFindings,
  "performance-findings.json": PATHS.performanceFindings,
  "raw-findings.json": PATHS.rawFindings,
  "validator-output.json": PATHS.validatorOutput,
  "known-issues.json": PATHS.knownIssues,
  "findings.json": PATHS.findings,
  "pr-files.txt": ".ai-code-review/pr-files.txt",
};

export type SeedWorkspaceOptions = {
  caseDir: string;
  caseId: string;
  /** Defaults to `caseId` under `evals/fixtures/`. */
  fixtureId?: string;
  runId?: string;
};

export type SeededWorkspace = {
  cwd: string;
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

  await fs.mkdir(path.join(cwd, WORK_DIR), { recursive: true });

  const inputsDir = path.join(options.caseDir, "inputs");
  if (await pathExists(inputsDir)) {
    const files = await fs.readdir(inputsDir);
    for (const file of files) {
      const destRel = INPUT_DEST[file];
      if (!destRel) {
        throw new Error(`Unknown input file "${file}" in ${inputsDir}`);
      }
      const dest = path.join(cwd, destRel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(path.join(inputsDir, file), dest);
    }
  }

  return {
    cwd,
    cleanup: async () => {
      await fs.rm(cwd, { recursive: true, force: true });
    },
  };
}
