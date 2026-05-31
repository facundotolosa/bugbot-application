# Evals harness

Regression harness for the AI code review pipeline. Evals invoke LLM-backed agents; deterministic pipeline code stays in Vitest (`npm test`).

## Tests vs evals

| | **Vitest (`npm test`)** | **Evals (`npm run eval`)** |
|---|------------------------|---------------------------|
| Calls LLM | No | Yes |
| Speed | Seconds | Minutes |
| CI default | Every PR | Not in v1 (local only) |
| Examples | `merge-findings.test.ts`, `agent-stream.test.ts` | Golden security leak in diff |

## Running locally (v1)

Evals are **local-only** in v1 — there is no GitHub Actions workflow for `npm run eval`.

```bash
export CURSOR_API_KEY=...   # required
npm run eval                # all suites (when cases exist)
npm run eval -- --suite analyzer-security --case leaked-key
npm test -w evals           # deterministic lib tests (no API key)
```

Optional env:

- `EVAL_MODEL_ID` — reviewer model (default `composer-2.5`)
- `EVAL_JUDGE_MODEL_ID` — LLM-as-judge model (defaults to reviewer model)

## Layout

```
evals/
  cases/<suite>/<case-id>/   # expect.json + inputs/
  fixtures/                  # minimal repos for component suites
  lib/                       # runner, assertions, invocation parity
  out/                       # run artifacts (gitignored)
  config.ts
  run.ts
```

Suites: `e2e`, `analyzer-security`, `analyzer-performance`, `validator`.

## Adding a case

1. Create `evals/cases/<suite>/<case-id>/`.
2. Add `expect.json` with `suite`, `must_find` / `must_not_find`, and `judge.rubric` (see spec).
3. Add frozen inputs under `inputs/` (e.g. `diff.json`, `raw-findings.json`).
4. For component cases, add a matching tree under `evals/fixtures/<case-id>/`.

Golden cases are discovered when `expect.json` exists.

### `--refresh-inputs`

When `inputs/diff-refs.json` is present (`source`, `target`, `pr_files`), re-runs `prepare-diff` against `evals/fixtures/<case-id>/` (git repo) and overwrites `inputs/diff.json`. Fixture repos ship with two commits (`HEAD` / `HEAD~1`).

### Analyzer golden cases (v1)

| Case | Suite | Fixture |
|------|-------|---------|
| `leaked-key` | `analyzer-security` | Hardcoded API key in `src/auth.ts` |
| `n-plus-one` | `analyzer-performance` | Per-id `fetch` inside a loop |

```bash
npm run eval -- --suite analyzer-security --case leaked-key
npm run eval:analyzers   # both analyzer suites
```

### Validator golden cases (v1)

| Case | Intent |
|------|--------|
| `dedup-positive` | Near-duplicate security findings on `src/auth.ts` collapse to one root-cause finding |
| `fp-filter-negative` | Placeholder credential + test-file nit filtered; real `src/auth.ts` token kept |

Inputs: frozen `raw-findings.json` + `known-issues.json`. Validator harness uses the **three-line** Task prompt only; **no retry** on missing/invalid `validator-output.json`.

```bash
npm run eval:validator
npm run eval -- --suite validator --case dedup-positive
```

## Invocation parity

Production subagents receive minimal Task prompts from the orchestrator skill; rules live in `.cursor/agents/*.md`.

Evals import **`evals/lib/invocation.ts`** as the single source of truth for:

- `SUBAGENT_TYPES` and `PATHS` under `.ai-code-review/`
- `securityTaskPrompt()`, `performanceTaskPrompt()`, `validatorTaskPrompt()` — byte-identical to [SKILL.md](../.cursor/skills/ai-code-review/SKILL.md) Task blocks
- `buildComponentHarnessPrompt()` for component evals (one Task, no duplicated agent rules)
- `MODEL_ID` and `SETTING_SOURCES` (`["project"]`) matching `reviewer-runner` `agent.ts`

If `SKILL.md` prompt lines change, update `invocation.ts` and fix `invocation.test.ts` — drift fails CI-style locally via `npm test -w evals`.

## Case assertions (deterministic lib)

| Module | Role |
|--------|------|
| `lib/expect.ts` | Parse and validate `expect.json` |
| `lib/workspace.ts` | Copy `evals/fixtures/<id>` + case `inputs/` into a temp workspace |
| `lib/structural.ts` | JSON + schema gates via `parseFindingsJson` / analyzer merge / `parseValidatorOutput` |
| `lib/judge.ts` | LLM-as-judge prompt builder + `runJudgeWithAgent` (transcripts under `evals/out/<run-id>/`) |
| `lib/assert-case.ts` | Structural gates → judge per expectation → optional `validator_funnel` checks |
