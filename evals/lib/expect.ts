import { readFile } from "node:fs/promises";

import type {
  CaseExpect,
  MustFindExpectation,
  MustNotFindExpectation,
  SeverityMin,
  ValidatorFunnelExpectation,
} from "./types.js";

const SEVERITIES: SeverityMin[] = [
  "critical",
  "major",
  "minor",
  "enhancement",
];

function expectObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function parseMustFind(items: unknown): MustFindExpectation[] {
  if (!Array.isArray(items)) {
    throw new Error("must_find must be an array");
  }
  return items.map((item, i) => {
    const o = expectObject(item, `must_find[${i}]`);
    const entry: MustFindExpectation = {
      file: expectString(o.file, `must_find[${i}].file`),
    };
    if (o.line_near !== undefined) {
      if (typeof o.line_near !== "number" || !Number.isInteger(o.line_near)) {
        throw new Error(`must_find[${i}].line_near must be an integer`);
      }
      entry.line_near = o.line_near;
    }
    if (o.line_tolerance !== undefined) {
      if (
        typeof o.line_tolerance !== "number" ||
        !Number.isInteger(o.line_tolerance) ||
        o.line_tolerance < 0
      ) {
        throw new Error(`must_find[${i}].line_tolerance must be a non-negative integer`);
      }
      entry.line_tolerance = o.line_tolerance;
    }
    if (o.match !== undefined) {
      entry.match = expectString(o.match, `must_find[${i}].match`);
    }
    if (o.severity_min !== undefined) {
      if (
        typeof o.severity_min !== "string" ||
        !SEVERITIES.includes(o.severity_min as SeverityMin)
      ) {
        throw new Error(
          `must_find[${i}].severity_min must be critical, major, minor, or enhancement`,
        );
      }
      entry.severity_min = o.severity_min as SeverityMin;
    }
    return entry;
  });
}

function parseMustNotFind(items: unknown): MustNotFindExpectation[] {
  if (!Array.isArray(items)) {
    throw new Error("must_not_find must be an array");
  }
  return items.map((item, i) => {
    const o = expectObject(item, `must_not_find[${i}]`);
    const entry: MustNotFindExpectation = {
      file: expectString(o.file, `must_not_find[${i}].file`),
    };
    if (o.match !== undefined) {
      entry.match = expectString(o.match, `must_not_find[${i}].match`);
    }
    return entry;
  });
}

function parseValidatorFunnel(
  value: unknown,
): ValidatorFunnelExpectation | undefined {
  if (value === undefined) return undefined;
  const o = expectObject(value, "validator_funnel");
  const funnel: ValidatorFunnelExpectation = {};
  for (const key of ["final_output_max", "final_output_min"] as const) {
    if (o[key] === undefined) continue;
    if (typeof o[key] !== "number" || !Number.isInteger(o[key]) || o[key]! < 0) {
      throw new Error(`validator_funnel.${key} must be a non-negative integer`);
    }
    funnel[key] = o[key] as number;
  }
  return funnel;
}

export function parseExpectJson(text: string): CaseExpect {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("expect.json is not valid JSON");
  }
  const root = expectObject(data, "expect.json");
  const suite = expectString(root.suite, "suite");
  const judgeObj = expectObject(root.judge, "judge");
  const rubric = expectString(judgeObj.rubric, "judge.rubric");

  const must_find =
    root.must_find === undefined ? [] : parseMustFind(root.must_find);
  const must_not_find =
    root.must_not_find === undefined ? [] : parseMustNotFind(root.must_not_find);

  if (must_find.length === 0 && must_not_find.length === 0) {
    throw new Error("expect.json must include at least one must_find or must_not_find entry");
  }

  return {
    suite,
    must_find: must_find.length > 0 ? must_find : undefined,
    must_not_find: must_not_find.length > 0 ? must_not_find : undefined,
    validator_funnel: parseValidatorFunnel(root.validator_funnel),
    judge: { rubric },
  };
}

export async function loadExpectFile(path: string): Promise<CaseExpect> {
  const text = await readFile(path, "utf8");
  return parseExpectJson(text);
}
