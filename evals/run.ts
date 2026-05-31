#!/usr/bin/env node
import { loadRepoEnv } from "../packages/reviewer-runner/src/support/load-repo-env.js";

loadRepoEnv();

import path from "node:path";

import { EVALS_ROOT } from "./config.js";
import { parseCliArgs, requireCursorApiKey } from "./lib/cli.js";
import { discoverCases } from "./lib/discover-cases.js";
import { runGoldenCase } from "./lib/run-case.js";
import { buildEvalRunSummary, formatEvalRunSummary } from "./lib/summary.js";

function createRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function formatSuiteFilter(options: ReturnType<typeof parseCliArgs>): string {
  if (options.suites.length > 0) {
    return options.suites.join(",");
  }
  return options.suite ?? "*";
}

async function main(): Promise<void> {
  const options = parseCliArgs();
  requireCursorApiKey();

  const apiKey = process.env.CURSOR_API_KEY!.trim();
  const repoRoot = path.join(EVALS_ROOT, "..");
  const cases = await discoverCases(options);

  if (cases.length === 0) {
    console.log(
      `No golden cases found (filters: suite=${formatSuiteFilter(options)}, case=${options.caseId ?? "*"}).`,
    );
    console.log(
      "Add cases under evals/cases/<suite>/<case-id>/ with expect.json.",
    );
    process.exit(0);
  }

  const runId = createRunId();
  console.log(`Eval run ${runId}`);
  console.log(`Cases: ${cases.length}`);
  if (options.refreshInputs) {
    console.log("Mode: --refresh-inputs enabled");
  }
  console.log();

  const results = [];
  for (const discovered of cases) {
    console.log(`▶ ${discovered.suite}/${discovered.caseId}`);
    const result = await runGoldenCase(discovered, {
      runId,
      refreshInputs: options.refreshInputs,
      apiKey,
      repoRoot,
    });
    results.push(result);

    const status = result.pass ? "PASS" : "FAIL";
    const retry = result.retry ? " retry=yes" : "";
    const judge = result.judgeUsed ? " judge=yes" : "";
    console.log(
      `  ${status} (${(result.durationMs / 1000).toFixed(1)}s${retry}${judge})`,
    );
    if (result.taskPrompt) {
      const lineCount = result.taskPrompt.split("\n").length;
      console.log(`  Task prompt (${lineCount} lines):`);
      for (const line of result.taskPrompt.split("\n")) {
        console.log(`    ${line}`);
      }
    }
    if (result.error) {
      console.log(`  ${result.error}`);
    }
    console.log();
  }

  const summary = buildEvalRunSummary(results);
  console.log("Summary");
  console.log(formatEvalRunSummary(summary));
  console.log();
  console.log(`Artifacts: evals/out/${runId}/`);

  process.exit(summary.failed === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
