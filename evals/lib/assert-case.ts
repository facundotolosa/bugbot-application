import type { FilterSummary } from "../../.cursor/skills/ai-code-review/scripts/validator-output.ts";
import type { AnalyzerKey } from "../../packages/reviewer-runner/src/findings/findings.js";

import type { CaseExpect, JudgeResult } from "./types.js";
import type { JudgeFn } from "./judge.js";
import {
  structuralGateFromFile,
  structuralGateFromText,
  type StructuralArtifactKind,
} from "./structural.js";

export type ExpectationVerdict = {
  kind: "must_find" | "must_not_find";
  index: number;
  result: JudgeResult;
};

export type AssertCaseResult = {
  pass: boolean;
  structuralError?: string;
  expectationVerdicts: ExpectationVerdict[];
  funnelError?: string;
};

function checkValidatorFunnel(
  expect: CaseExpect,
  summary: FilterSummary | undefined,
): string | undefined {
  const funnel = expect.validator_funnel;
  if (!funnel) return undefined;
  if (!summary) {
    return "validator_funnel expectations require validator filter_summary";
  }
  const { final_output } = summary;
  if (
    funnel.final_output_min !== undefined &&
    final_output < funnel.final_output_min
  ) {
    return `filter_summary.final_output ${final_output} < min ${funnel.final_output_min}`;
  }
  if (
    funnel.final_output_max !== undefined &&
    final_output > funnel.final_output_max
  ) {
    return `filter_summary.final_output ${final_output} > max ${funnel.final_output_max}`;
  }
  return undefined;
}

async function runExpectationJudges(
  expect: CaseExpect,
  findingsPayload: unknown,
  judgeFn: JudgeFn,
): Promise<ExpectationVerdict[]> {
  const rubric = expect.judge.rubric;
  const verdicts: ExpectationVerdict[] = [];

  for (const [index, entry] of (expect.must_find ?? []).entries()) {
    const result = await judgeFn({
      kind: "must_find",
      index,
      expectation: entry,
      rubric,
      findingsPayload,
    });
    verdicts.push({ kind: "must_find", index, result });
  }

  for (const [index, entry] of (expect.must_not_find ?? []).entries()) {
    const result = await judgeFn({
      kind: "must_not_find",
      index,
      expectation: entry,
      rubric,
      findingsPayload,
    });
    verdicts.push({ kind: "must_not_find", index, result });
  }

  return verdicts;
}

export type AssertCaseFromTextParams = {
  expect: CaseExpect;
  artifactText: string;
  artifactKind: StructuralArtifactKind;
  analyzer?: AnalyzerKey;
  judgeFn: JudgeFn;
};

export async function assertCaseFromText(
  params: AssertCaseFromTextParams,
): Promise<AssertCaseResult> {
  let gate;
  try {
    gate = structuralGateFromText(
      params.artifactText,
      params.artifactKind,
      params.analyzer,
    );
  } catch (err) {
    return {
      pass: false,
      structuralError: err instanceof Error ? err.message : String(err),
      expectationVerdicts: [],
    };
  }

  const expectationVerdicts = await runExpectationJudges(
    params.expect,
    gate.findingsReport,
    params.judgeFn,
  );

  const funnelError = checkValidatorFunnel(
    params.expect,
    gate.filterSummary,
  );

  const expectationsPass = expectationVerdicts.every((v) => v.result.pass);
  const pass = expectationsPass && !funnelError;

  return {
    pass,
    expectationVerdicts,
    funnelError,
  };
}

export type AssertCaseFromFileParams = {
  expect: CaseExpect;
  artifactPath: string;
  artifactKind: StructuralArtifactKind;
  analyzer?: AnalyzerKey;
  judgeFn: JudgeFn;
};

export async function assertCaseFromFile(
  params: AssertCaseFromFileParams,
): Promise<AssertCaseResult> {
  let gate;
  try {
    gate = await structuralGateFromFile(
      params.artifactPath,
      params.artifactKind,
      params.analyzer,
    );
  } catch (err) {
    return {
      pass: false,
      structuralError: err instanceof Error ? err.message : String(err),
      expectationVerdicts: [],
    };
  }

  const expectationVerdicts = await runExpectationJudges(
    params.expect,
    gate.findingsReport,
    params.judgeFn,
  );

  const funnelError = checkValidatorFunnel(
    params.expect,
    gate.filterSummary,
  );

  const expectationsPass = expectationVerdicts.every((v) => v.result.pass);
  const pass = expectationsPass && !funnelError;

  return {
    pass,
    expectationVerdicts,
    funnelError,
  };
}
