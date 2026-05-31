#!/usr/bin/env node
import { loadRepoEnv } from "../packages/reviewer-runner/src/support/load-repo-env.js";

loadRepoEnv();

import path from "node:path";

import { EVALS_ROOT } from "./config.js";
import { parseCliArgs, requireCursorApiKey } from "./lib/cli.js";
import { discoverCases } from "./lib/discover-cases.js";
import { EvalReporter } from "./lib/reporter.js";
import { runGoldenCase } from "./lib/run-case.js";
import { buildEvalRunSummary } from "./lib/summary.js";
import { installProcessGuards } from "../packages/reviewer-runner/src/support/process-guard.js";

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

  if (!options.verbose) {
    installProcessGuards();
  }

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
  const reporter = new EvalReporter();
  reporter.setVerbose(options.verbose);
  reporter.startRun(runId, cases, options.refreshInputs);

  const results = [];
  for (const discovered of cases) {
    reporter.startCase(discovered.suite, discovered.caseId);
    const result = await runGoldenCase(discovered, {
      runId,
      refreshInputs: options.refreshInputs,
      apiKey,
      repoRoot,
      verbose: options.verbose,
    });
    results.push(result);
    reporter.endCase(result);
  }

  const summary = buildEvalRunSummary(results);
  reporter.printSummary(summary, runId);

  process.exit(summary.failed === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
