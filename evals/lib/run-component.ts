import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { Agent } from "@cursor/sdk";

import { getEvalModelId } from "../config.js";
import {
  PATHS,
  PERFORMANCE_TASK_LINES,
  SECURITY_TASK_LINES,
  SETTING_SOURCES,
  SUBAGENT_TYPES,
  buildComponentHarnessPrompt,
} from "./invocation.js";
import { structuralGateFromText } from "./structural.js";
import type { AnalyzerKey } from "../../packages/reviewer-runner/src/findings.js";

export type AnalyzerComponentResult = {
  analyzer: AnalyzerKey;
  outputPath: string;
  outputText: string;
  retry: boolean;
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
    const agent = await Agent.create({
      apiKey: options.apiKey,
      model: { id: getEvalModelId() },
      local: {
        cwd: options.cwd,
        settingSources: [...SETTING_SOURCES],
      },
    });

    const runHarness = async (): Promise<void> => {
      const run = await agent.send(harnessPrompt);
      for await (const _event of run.stream()) {
        // drain stream
      }
      const waitResult = await run.wait();
      if (waitResult.status === "error") {
        throw new Error(`Harness agent failed: ${waitResult.id ?? run.id}`);
      }
    };

    await runHarness();
    outputText = await tryReadValid();

    if (!outputText) {
      retry = true;
      await runHarness();
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
