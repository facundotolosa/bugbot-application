#!/usr/bin/env node
import { parseCliArgs, requireCursorApiKey } from "./lib/cli.js";
import { discoverCases } from "./lib/discover-cases.js";

async function main(): Promise<void> {
  const options = parseCliArgs();
  requireCursorApiKey();

  const cases = await discoverCases(options);

  if (cases.length === 0) {
    const filter =
      options.suite || options.caseId
        ? ` (filters: suite=${options.suite ?? "*"}, case=${options.caseId ?? "*"})`
        : "";
    console.log(`No golden cases found${filter}. Add cases under evals/cases/<suite>/<case-id>/ with expect.json.`);
    process.exit(0);
  }

  console.log(`Discovered ${cases.length} case(s) (runner stub — execution in later phases):`);
  for (const c of cases) {
    console.log(`  - ${c.suite}/${c.caseId}`);
  }
  if (options.refreshInputs) {
    console.log("Note: --refresh-inputs is not implemented until Phase 4.");
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
