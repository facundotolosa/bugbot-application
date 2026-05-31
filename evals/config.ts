import path from "node:path";
import { fileURLToPath } from "node:url";

const EVALS_ROOT = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_MODEL_ID = "composer-2.5";

/** Reviewer model (`EVAL_MODEL_ID` overrides). */
export function getEvalModelId(): string {
  return process.env.EVAL_MODEL_ID ?? DEFAULT_MODEL_ID;
}

/** LLM-as-judge model (`EVAL_JUDGE_MODEL_ID` overrides; defaults to reviewer model). */
export function getJudgeModelId(): string {
  return process.env.EVAL_JUDGE_MODEL_ID ?? getEvalModelId();
}

/** Artifact output root: `evals/out/` (gitignored). */
export function getOutDir(): string {
  return path.join(EVALS_ROOT, "out");
}

export { EVALS_ROOT };
