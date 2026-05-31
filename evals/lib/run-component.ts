import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { Agent } from "@cursor/sdk";

import { getEvalModelId } from "../config.js";
import type {
  FilterSummary,
  ValidatorOutput,
} from "../../.cursor/skills/ai-code-review/scripts/validator-output.ts";
import {
  PATHS,
  PERFORMANCE_TASK_LINES,
  SECURITY_TASK_LINES,
  SETTING_SOURCES,
  SUBAGENT_TYPES,
  VALIDATOR_TASK_LINES,
  buildComponentHarnessPrompt,
} from "./invocation.js";
import {
  structuralGateFromText,
  type StructuralGateResult,
} from "./structural.js";
import type {
  AnalyzerKey,
  FindingsReport,
} from "../../packages/reviewer-runner/src/findings.js";

export type AnalyzerComponentResult = {
  analyzer: AnalyzerKey;
  outputPath: string;
  outputText: string;
  retry: boolean;
  taskPrompt: string;
  harnessPrompt: string;
};

export type ValidatorComponentResult = {
  outputPath: string;
  outputText: string;
  findingsReport: FindingsReport;
  filterSummary: FilterSummary;
  validatorOutput: ValidatorOutput;
  retry: false;
  taskPrompt: string;
  harnessPrompt: string;
};

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function analyzerConfig(analyzer: AnalyzerKey): {
  subagentType: string;
  taskLines: readonly string[];
  outputRel: string;
} {
  if (analyzer === "security") {
    return {
      subagentType: SUBAGENT_TYPES.security,
      taskLines: SECURITY_TASK_LINES,
      outputRel: PATHS.securityFindings,
    };
  }
  return {
    subagentType: SUBAGENT_TYPES.performance,
    taskLines: PERFORMANCE_TASK_LINES,
    outputRel: PATHS.performanceFindings,
  };
}

export async function readAnalyzerOutput(
  cwd: string,
  analyzer: AnalyzerKey,
): Promise<string | null> {
  const rel = analyzerConfig(analyzer).outputRel;
  const filePath = path.join(cwd, rel);
  if (!(await fileExists(filePath))) {
    return null;
  }
  return readFile(filePath, "utf8");
}

export function validateAnalyzerOutputText(
  text: string,
  analyzer: AnalyzerKey,
): void {
  structuralGateFromText(text, "analyzer", analyzer);
}

async function runHarnessAgent(options: {
  cwd: string;
  apiKey: string;
  harnessPrompt: string;
}): Promise<void> {
  const agent = await Agent.create({
    apiKey: options.apiKey,
    model: { id: getEvalModelId() },
    local: {
      cwd: options.cwd,
      settingSources: [...SETTING_SOURCES],
    },
  });

  const run = await agent.send(options.harnessPrompt);
  for await (const _event of run.stream()) {
    // drain stream
  }
  const waitResult = await run.wait();
  if (waitResult.status === "error") {
    throw new Error(`Harness agent failed: ${waitResult.id ?? run.id}`);
  }
}

export async function readValidatorOutput(cwd: string): Promise<string | null> {
  const filePath = path.join(cwd, PATHS.validatorOutput);
  if (!(await fileExists(filePath))) {
    return null;
  }
  return readFile(filePath, "utf8");
}

export function validateValidatorOutputText(
  text: string,
): StructuralGateResult {
  return structuralGateFromText(text, "validator-output");
}

export async function runValidatorHarness(options: {
  cwd: string;
  apiKey: string;
  dryRun?: boolean;
}): Promise<ValidatorComponentResult> {
  const taskPrompt = VALIDATOR_TASK_LINES.join("\n");
  const harnessPrompt = buildComponentHarnessPrompt(
    SUBAGENT_TYPES.validator,
    VALIDATOR_TASK_LINES,
  );
  const outputPath = path.join(options.cwd, PATHS.validatorOutput);

  const tryReadValid = async (): Promise<StructuralGateResult | null> => {
    const text = await readValidatorOutput(options.cwd);
    if (!text) return null;
    try {
      return validateValidatorOutputText(text);
    } catch {
      return null;
    }
  };

  let gate = await tryReadValid();

  if (!gate && !options.dryRun) {
    await runHarnessAgent({
      cwd: options.cwd,
      apiKey: options.apiKey,
      harnessPrompt,
    });
    gate = await tryReadValid();
  }

  if (!gate?.validatorOutput) {
    throw new Error(
      `Validator output missing or invalid at ${PATHS.validatorOutput} (no retry)`,
    );
  }

  const outputText = await readValidatorOutput(options.cwd);
  if (!outputText) {
    throw new Error(`Validator output unreadable at ${PATHS.validatorOutput}`);
  }

  return {
    outputPath,
    outputText,
    findingsReport: gate.findingsReport,
    filterSummary: gate.filterSummary!,
    validatorOutput: gate.validatorOutput,
    retry: false,
    taskPrompt,
    harnessPrompt,
  };
}

export async function runAnalyzerHarness(options: {
  cwd: string;
  analyzer: AnalyzerKey;
  apiKey: string;
  /** When true, skip Agent and only validate existing output (tests). */
  dryRun?: boolean;
}): Promise<AnalyzerComponentResult> {
  const { subagentType, taskLines, outputRel } = analyzerConfig(options.analyzer);
  const taskPrompt = taskLines.join("\n");
  const harnessPrompt = buildComponentHarnessPrompt(subagentType, taskLines);
  const outputPath = path.join(options.cwd, outputRel);

  let retry = false;

  const tryReadValid = async (): Promise<string | null> => {
    const text = await readAnalyzerOutput(options.cwd, options.analyzer);
    if (!text) return null;
    try {
      validateAnalyzerOutputText(text, options.analyzer);
      return text;
    } catch {
      return null;
    }
  };

  let outputText = await tryReadValid();

  if (!outputText && !options.dryRun) {
    await runHarnessAgent({
      cwd: options.cwd,
      apiKey: options.apiKey,
      harnessPrompt,
    });
    outputText = await tryReadValid();

    if (!outputText) {
      retry = true;
      await runHarnessAgent({
        cwd: options.cwd,
        apiKey: options.apiKey,
        harnessPrompt,
      });
      outputText = await tryReadValid();
    }
  }

  if (!outputText) {
    throw new Error(
      `Analyzer output missing or invalid at ${outputRel}${retry ? " (after retry)" : ""}`,
    );
  }

  return {
    analyzer: options.analyzer,
    outputPath,
    outputText,
    retry,
    taskPrompt,
    harnessPrompt,
  };
}
