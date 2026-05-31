import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  prepareDiff,
  type PrepareDiffOutput,
} from "../../.cursor/skills/ai-code-review/scripts/prepare-diff.ts";
import { EVALS_ROOT } from "../config.js";

export type DiffRefs = {
  source: string;
  target: string;
  pr_files: string[];
};

export async function loadDiffRefs(caseDir: string): Promise<DiffRefs> {
  const refsPath = path.join(caseDir, "inputs", "diff-refs.json");
  const text = await readFile(refsPath, "utf8");
  const data = JSON.parse(text) as Record<string, unknown>;
  if (typeof data.source !== "string" || typeof data.target !== "string") {
    throw new Error("diff-refs.json requires source and target strings");
  }
  if (!Array.isArray(data.pr_files) || data.pr_files.some((f) => typeof f !== "string")) {
    throw new Error("diff-refs.json requires pr_files string array");
  }
  return {
    source: data.source,
    target: data.target,
    pr_files: data.pr_files as string[],
  };
}

export async function refreshCaseDiffInput(options: {
  caseDir: string;
  fixtureId: string;
}): Promise<PrepareDiffOutput> {
  const refs = await loadDiffRefs(options.caseDir);
  const fixtureRoot = path.join(EVALS_ROOT, "fixtures", options.fixtureId);
  const output = await prepareDiff({
    source: refs.source,
    target: refs.target,
    prFiles: new Set(refs.pr_files),
    cwd: fixtureRoot,
  });

  const dest = path.join(options.caseDir, "inputs", "diff.json");
  await writeFile(dest, JSON.stringify(output, null, 2), "utf8");
  return output;
}
