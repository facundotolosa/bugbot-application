import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { REVIEW_RUN_FILES } from "../../packages/reviewer-runner/src/review-run-dir.js";

import { Agent } from "@cursor/sdk";

import { REPO_ROOT } from "../../packages/reviewer-runner/src/load-repo-env.js";
import { getEvalModelId } from "../config.js";
import type {
  FilterSummary,
  ValidatorOutput,
} from "../../.cursor/skills/ai-code-review/scripts/validator-output.ts";
import {
  buildComponentHarnessPrompt,
  performanceTaskPrompt,
  securityTaskPrompt,
  SETTING_SOURCES,
  SUBAGENT_TYPES,
  validatorTaskPrompt,
} from "./invocation.js";
import { buildSessionManifest, resolveEvalSessionDir } from "./session.js";
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

function analyzerOutputPath(
  sessionDir: string,
  analyzer: AnalyzerKey,
): string {
  const m = buildSessionManifest(sessionDir);
  return analyzer === "security" ? m.security : m.performance;
}

export async function readAnalyzerOutput(
  cwd: string,
  analyzer: AnalyzerKey,
): Promise<string | null> {
  const sessionDir = resolveEvalSessionDir(cwd);
  const filePath = analyzerOutputPath(sessionDir, analyzer);
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
  apiKey: string;
  harnessPrompt: string;
}): Promise<void> {
  const agent = await Agent.create({
    apiKey: options.apiKey,
    model: { id: getEvalModelId() },
    local: {
      cwd: REPO_ROOT,
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
  const sessionDir = resolveEvalSessionDir(cwd);
  const filePath = buildSessionManifest(sessionDir).validatorOut;
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
  reviewRunDir: string;
  apiKey: string;
  dryRun?: boolean;
}): Promise<ValidatorComponentResult> {
  const sessionDir = resolveEvalSessionDir(options.cwd);
  const knownIssuesPath = join(options.reviewRunDir, REVIEW_RUN_FILES.knownIssues);
  const taskPrompt = validatorTaskPrompt(sessionDir, knownIssuesPath);
  const harnessPrompt = buildComponentHarnessPrompt(
    SUBAGENT_TYPES.validator,
    taskPrompt,
  );
  const outputPath = buildSessionManifest(sessionDir).validatorOut;

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
      apiKey: options.apiKey,
      harnessPrompt,
    });
    gate = await tryReadValid();
  }

  if (!gate?.validatorOutput) {
    throw new Error(
      `Validator output missing or invalid at ${outputPath} (no retry)`,
    );
  }

  const outputText = await readValidatorOutput(options.cwd);
  if (!outputText) {
    throw new Error(`Validator output unreadable at ${outputPath}`);
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
  dryRun?: boolean;
}): Promise<AnalyzerComponentResult> {
  const sessionDir = resolveEvalSessionDir(options.cwd);
  const taskPrompt =
    options.analyzer === "security"
      ? securityTaskPrompt(sessionDir)
      : performanceTaskPrompt(sessionDir);
  const harnessPrompt = buildComponentHarnessPrompt(
    options.analyzer === "security"
      ? SUBAGENT_TYPES.security
      : SUBAGENT_TYPES.performance,
    taskPrompt,
  );
  const outputPath = analyzerOutputPath(sessionDir, options.analyzer);

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
      apiKey: options.apiKey,
      harnessPrompt,
    });
    outputText = await tryReadValid();

    if (!outputText) {
      retry = true;
      await runHarnessAgent({
        apiKey: options.apiKey,
        harnessPrompt,
      });
      outputText = await tryReadValid();
    }
  }

  if (!outputText) {
    throw new Error(
      `Analyzer output missing or invalid at ${outputPath}${retry ? " (after retry)" : ""}`,
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
