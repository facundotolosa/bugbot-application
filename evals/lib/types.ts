export type SeverityMin = "critical" | "major" | "minor" | "enhancement";

export type MustFindExpectation = {
  file: string;
  line_near?: number;
  line_tolerance?: number;
  match?: string;
  severity_min?: SeverityMin;
};

export type MustNotFindExpectation = {
  file: string;
  match?: string;
};

export type ValidatorFunnelExpectation = {
  final_output_max?: number;
  final_output_min?: number;
};

export type CaseExpect = {
  suite: string;
  must_find?: MustFindExpectation[];
  must_not_find?: MustNotFindExpectation[];
  validator_funnel?: ValidatorFunnelExpectation;
  judge: { rubric: string };
};

export type JudgeResult = {
  pass: boolean;
  reason: string;
};

export type ExpectationKind = "must_find" | "must_not_find";

export type ExpectationJudgeRequest = {
  kind: ExpectationKind;
  index: number;
  expectation: MustFindExpectation | MustNotFindExpectation;
  rubric: string;
  findingsPayload: unknown;
};
