import { access, readFile } from "node:fs/promises";

import {
  mergeAnalyzerOutputs,
  type AnalyzerOutput,
} from "../../.cursor/skills/ai-code-review/scripts/merge-findings.ts";
import {
  mapValidatorToFindingsReport,
  parseValidatorOutput,
  type FilterSummary,
  type ValidatorOutput,
} from "../../.cursor/skills/ai-code-review/scripts/validator-output.ts";
import {
  parseFindingsJson,
  type AnalyzerKey,
  type FindingsReport,
} from "../../packages/reviewer-runner/src/findings/findings.js";

export type StructuralArtifactKind =
  | "findings"
  | "analyzer"
  | "validator-output";

export type StructuralGateResult = {
  kind: StructuralArtifactKind;
  findingsReport: FindingsReport;
  validatorOutput?: ValidatorOutput;
  filterSummary?: FilterSummary;
};

async function readArtifactText(filePath: string): Promise<string> {
  try {
    await access(filePath);
  } catch {
    throw new Error(`Artifact file not found: ${filePath}`);
  }
  return readFile(filePath, "utf8");
}

function parseAnalyzerOutputJson(
  text: string,
  analyzer: AnalyzerKey,
): AnalyzerOutput {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Analyzer output is not valid JSON");
  }
  if (!data || typeof data !== "object") {
    throw new Error("Analyzer output must be an object");
  }
  const record = data as Record<string, unknown>;
  if (record.analyzer !== analyzer) {
    throw new Error(`Analyzer output analyzer must be "${analyzer}"`);
  }
  if (!Array.isArray(record.findings)) {
    throw new Error("Analyzer output must include findings array");
  }
  const output: AnalyzerOutput = {
    analyzer,
    findings: record.findings as AnalyzerOutput["findings"],
  };
  mergeAnalyzerOutputs([output]);
  return output;
}

export function structuralGateFromText(
  text: string,
  kind: StructuralArtifactKind,
  analyzer?: AnalyzerKey,
): StructuralGateResult {
  if (kind === "findings") {
    return { kind, findingsReport: parseFindingsJson(text) };
  }

  if (kind === "analyzer") {
    if (!analyzer) {
      throw new Error("structuralGate requires analyzer for analyzer artifacts");
    }
    const output = parseAnalyzerOutputJson(text, analyzer);
    return {
      kind,
      findingsReport: mergeAnalyzerOutputs([output]),
    };
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Validator output is not valid JSON");
  }
  const validatorOutput = parseValidatorOutput(data);
  return {
    kind,
    findingsReport: mapValidatorToFindingsReport(validatorOutput),
    validatorOutput,
    filterSummary: validatorOutput.filter_summary,
  };
}

export async function structuralGateFromFile(
  filePath: string,
  kind: StructuralArtifactKind,
  analyzer?: AnalyzerKey,
): Promise<StructuralGateResult> {
  const text = await readArtifactText(filePath);
  return structuralGateFromText(text, kind, analyzer);
}
