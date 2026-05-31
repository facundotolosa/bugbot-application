import fs from "node:fs/promises";
import path from "node:path";

import { EVALS_ROOT } from "../config.js";
import type { CliOptions } from "./cli.js";

export type DiscoveredCase = {
  suite: string;
  caseId: string;
  dir: string;
};

const CASES_ROOT = path.join(EVALS_ROOT, "cases");

export async function discoverCases(
  options: CliOptions,
): Promise<DiscoveredCase[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(CASES_ROOT);
  } catch {
    return [];
  }

  const cases: DiscoveredCase[] = [];

  for (const suite of entries) {
    if (options.suite && suite !== options.suite) continue;

    const suiteDir = path.join(CASES_ROOT, suite);
    const stat = await fs.stat(suiteDir).catch(() => null);
    if (!stat?.isDirectory()) continue;

    const caseIds = await fs.readdir(suiteDir);
    for (const caseId of caseIds) {
      if (caseId.startsWith("_")) continue;
      if (options.caseId && caseId !== options.caseId) continue;

      const caseDir = path.join(suiteDir, caseId);
      const caseStat = await fs.stat(caseDir).catch(() => null);
      if (!caseStat?.isDirectory()) continue;

      const expectPath = path.join(caseDir, "expect.json");
      try {
        await fs.access(expectPath);
      } catch {
        continue;
      }

      cases.push({ suite, caseId, dir: caseDir });
    }
  }

  return cases.sort((a, b) =>
    a.suite === b.suite
      ? a.caseId.localeCompare(b.caseId)
      : a.suite.localeCompare(b.suite),
  );
}
