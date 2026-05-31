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

Golden cases are discovered when `expect.json` exists. Use `--refresh-inputs` (Phase 4+) to regenerate `inputs/diff.json` via `prepare-diff`.
