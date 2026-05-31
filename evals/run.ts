#!/usr/bin/env node
import path from "node:path";

import { EVALS_ROOT } from "./config.js";
import { parseCliArgs, requireCursorApiKey } from "./lib/cli.js";
import { discoverCases } from "./lib/discover-cases.js";
import { runGoldenCase } from "./lib/run-case.js";

function createRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main(): Promise<void> {
  const options = parseCliArgs();
  requireCursorApiKey();

  const apiKey = process.env.CURSOR_API_KEY!.trim();
  const repoRoot = path.join(EVALS_ROOT, "..");
  const cases = await discoverCases(options);

  if (cases.length === 0) {
    const filter =
      options.suite || options.caseId
        ? ` (filters: suite=${options.suite ?? "*"}, case=${options.caseId ?? "*"})`
        : "";
    console.log(
      `No golden cases found${filter}. Add cases under evals/cases/<suite>/<case-id>/ with expect.json.`,
    );
    process.exit(0);
  }

  const runId = createRunId();
  console.log(`Eval run ${runId} — ${cases.length} case(s)\n`);

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
      console.log("  Task prompt (2 lines):");
      for (const line of result.taskPrompt.split("\n")) {
        console.log(`    ${line}`);
      }
    }
    if (result.error) {
      console.log(`  ${result.error}`);
    }
    console.log();
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`Summary: ${passed}/${results.length} passed`);
  console.log(`Artifacts: evals/out/${runId}/`);

  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
