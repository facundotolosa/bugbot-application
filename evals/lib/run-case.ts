import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { getOutDir } from "../config.js";
import { assertCaseFromText } from "./assert-case.js";
import { loadExpectFile } from "./expect.js";
import type { DiscoveredCase } from "./discover-cases.js";
import { createAgentJudge } from "./judge.js";
import { refreshCaseDiffInput } from "./refresh-diff.js";
import { runAnalyzerHarness } from "./run-component.js";
import { seedWorkspace } from "./workspace.js";
import type { AnalyzerKey } from "../../packages/reviewer-runner/src/findings.js";

export type CaseRunResult = {
  suite: string;
  caseId: string;
  pass: boolean;
  durationMs: number;
  retry: boolean;
  judgeUsed: boolean;
  taskPrompt?: string;
  error?: string;
};

const ANALYZER_SUITES: Record<string, AnalyzerKey> = {
  "analyzer-security": "security",
  "analyzer-performance": "performance",
};

export async function runGoldenCase(
  discovered: DiscoveredCase,
  options: {
    runId: string;
    refreshInputs: boolean;
    apiKey: string;
    repoRoot: string;
  },
): Promise<CaseRunResult> {
  const started = Date.now();
  const artifactDir = path.join(
    getOutDir(),
    options.runId,
    `${discovered.suite}-${discovered.caseId}`,
  );
  await mkdir(artifactDir, { recursive: true });

  const analyzer = ANALYZER_SUITES[discovered.suite];
  if (!analyzer) {
    return {
      suite: discovered.suite,
      caseId: discovered.caseId,
      pass: false,
      durationMs: Date.now() - started,
      retry: false,
      judgeUsed: false,
      error: `Suite "${discovered.suite}" is not runnable yet`,
    };
  }

  try {
    if (options.refreshInputs) {
      await refreshCaseDiffInput({
        caseDir: discovered.dir,
        fixtureId: discovered.caseId,
      });
    }

    const caseExpect = await loadExpectFile(path.join(discovered.dir, "expect.json"));
    const workspace = await seedWorkspace({
      caseDir: discovered.dir,
      caseId: discovered.caseId,
      runId: options.runId,
    });

    try {
      const component = await runAnalyzerHarness({
        cwd: workspace.cwd,
        analyzer,
        apiKey: options.apiKey,
      });

      await writeFile(
        path.join(artifactDir, "harness-prompt.txt"),
        component.harnessPrompt,
        "utf8",
      );
      await writeFile(
        path.join(artifactDir, "task-prompt.txt"),
        component.taskPrompt,
        "utf8",
      );
      await copyFile(
        component.outputPath,
        path.join(artifactDir, path.basename(component.outputPath)),
      );

      const judgeFn = createAgentJudge(options.repoRoot, artifactDir);
      const assertion = await assertCaseFromText({
        expect: caseExpect,
        artifactText: component.outputText,
        artifactKind: "analyzer",
        analyzer,
        judgeFn,
      });

      await writeFile(
        path.join(artifactDir, "assert-result.json"),
        JSON.stringify(assertion, null, 2),
        "utf8",
      );

      return {
        suite: discovered.suite,
        caseId: discovered.caseId,
        pass: assertion.pass,
        durationMs: Date.now() - started,
        retry: component.retry,
        judgeUsed: true,
        taskPrompt: component.taskPrompt,
        error: assertion.pass
          ? undefined
          : assertion.structuralError ??
            assertion.funnelError ??
            assertion.expectationVerdicts.find((v) => !v.result.pass)?.result.reason,
      };
    } finally {
      await workspace.cleanup();
    }
  } catch (err) {
    return {
      suite: discovered.suite,
      caseId: discovered.caseId,
      pass: false,
      durationMs: Date.now() - started,
      retry: false,
      judgeUsed: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
