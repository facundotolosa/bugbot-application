import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_MODEL_ID,
  getEvalModelId,
  getJudgeModelId,
  getOutDir,
} from "../config.js";

describe("config", () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it("defaults model ids to composer-2.5", () => {
    delete process.env.EVAL_MODEL_ID;
    delete process.env.EVAL_JUDGE_MODEL_ID;
    expect(getEvalModelId()).toBe(DEFAULT_MODEL_ID);
    expect(getJudgeModelId()).toBe(DEFAULT_MODEL_ID);
  });

  it("allows EVAL_JUDGE_MODEL_ID override", () => {
    process.env.EVAL_JUDGE_MODEL_ID = "judge-model";
    expect(getJudgeModelId()).toBe("judge-model");
  });

  it("resolves out dir under evals/", () => {
    expect(getOutDir()).toMatch(/evals[/\\]out$/);
  });
});
