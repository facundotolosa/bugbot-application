# Evals harness

Regression harness for the AI code review pipeline. Evals invoke LLM-backed agents; deterministic pipeline code stays in Vitest (`npm test`).

**v1 is local-only** — there is no GitHub Actions workflow for `npm run eval`. Use `CURSOR_API_KEY` on your machine.

## Tests vs evals

| | **Vitest (`npm test`)** | **Evals (`npm run eval`)** |
|---|------------------------|---------------------------|
| Calls LLM | No | Yes |
| Speed | Seconds | Minutes |
| CI default | Every PR | Not in v1 (local only) |
| Examples | `merge-findings.test.ts`, `agent-stream.test.ts` | Golden security leak in diff |

## Running locally

```bash
cp .env.example .env        # once: add CURSOR_API_KEY at repo root
npm run eval                # all golden cases (6 in v1)
npm test -w evals           # deterministic lib tests (no API key)
```

`npm run eval` loads **`/.env`** at the repository root automatically (`packages/reviewer-runner/src/load-repo-env.ts`). Legacy `packages/reviewer-runner/.env` is still read if present.

### npm scripts (repo root)

| Script | Command |
|--------|---------|
| `npm run eval` | All suites |
| `npm run eval:analyzers` | `analyzer-security` + `analyzer-performance` |
| `npm run eval:validator` | `validator` suite |
| `npm run eval:e2e` | `e2e` suite |

### CLI flags

| Flag | Effect |
|------|--------|
| `--suite <name>` | Filter suite (repeatable) |
| `--case <id>` | Filter case id |
| `--refresh-inputs` | Regenerate frozen inputs (diff or pr-files; see below) |
| `--verbose` | Show agent orchestration stream, SDK INFO, and task prompt dumps (default: quiet Vitest-style output) |

### Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `CURSOR_API_KEY` | repo root `.env` | **Required** for `npm run eval` (auto-loaded) |
| `EVAL_VERBOSE` | unset | Set to `1` for verbose agent output (same as `--verbose`; CLI flag wins if both set) |
| `EVAL_MODEL_ID` | `composer-2.5` | Reviewer / harness / E2E agent model |
| `EVAL_JUDGE_MODEL_ID` | same as `EVAL_MODEL_ID` | LLM-as-judge for `must_find` / `must_not_find` |

## Golden cases (v1)

| Case | Suite | Type |
|------|-------|------|
| `leaked-key` | `analyzer-security` | Component harness → security analyzer |
| `n-plus-one` | `analyzer-performance` | Component harness → performance analyzer |
| `dedup-positive` | `validator` | Component harness → validator (no retry) |
| `fp-filter-negative` | `validator` | Validator false-positive filters |
| `ledger-security` | `e2e` | Full `runReviewAgent` (pinned SHA, ledger-lite scope) |
| `ledger-pipeline` | `e2e` | Full orchestrator (performance + validator path) |

**Total: 6 cases** (2 analyzer + 2 validator + 2 E2E).

## Layout

```
evals/
  cases/<suite>/<case-id>/   # expect.json, inputs/, optional pins.json (e2e)
  fixtures/                  # minimal trees for component suites (+ git for refresh)
  lib/                       # runner, invocation parity, judge, assertions
  out/<run-id>/              # artifacts (gitignored)
  config.ts
  run.ts
```

## Run artifacts

Each run writes under `evals/out/<run-id>/`:

| Path | Contents |
|------|----------|
| `<suite>-<case>/task-prompt.txt` | Exact Task lines sent to subagent (component suites) |
| `<suite>-<case>/harness-prompt.txt` | Eval harness agent prompt (component) |
| `<suite>-<case>/assert-result.json` | Structural + judge verdicts |
| `<suite>-<case>/judge-*.json` | LLM judge transcripts |
| `<suite>-<case>/review-prompt.txt` | E2E only — `buildReviewPrompt` output |
| `worktrees/<case>/` | E2E only — detached worktree at `head_sha` (removed after case) |

Console output (default): Vitest-style suite/case tree with pass/fail, duration, and concise failure lines. Use `--verbose` or `EVAL_VERBOSE=1` for full agent stream. Artifacts and summary: `passed/total`, duration, retry count, judge count, per-suite breakdown.

## Adding a case

1. Create `evals/cases/<suite>/<case-id>/`.
2. Add `expect.json` with `suite`, `must_find` and/or `must_not_find`, and `judge.rubric`.
3. Add frozen inputs under `inputs/`.
4. Component cases: add `evals/fixtures/<case-id>/` (use git + `diff-refs.json` if using `--refresh-inputs`).
5. E2E cases: add `pins.json` (full SHAs, never `main`) and factory branch commits under `packages/ledger-lite/`.

Cases are discovered when `expect.json` exists.

### `--refresh-inputs`

| Suite | Regenerates |
|-------|-------------|
| `analyzer-*` | `inputs/diff.json` via `prepare-diff` + `inputs/diff-refs.json` + fixture git |
| `e2e` | `inputs/pr-files.txt` via `listPrFiles` between pinned SHAs (ledger-lite only) |
| `validator` | Not supported |

## Invocation parity

Production subagents receive minimal Task prompts from the orchestrator skill; rules live in `.cursor/agents/*.md`.

**`evals/lib/invocation.ts`** + **`evals/lib/session.ts`** are the source of truth for:

- `SUBAGENT_TYPES` and ephemeral session paths (`$TMPDIR/ai-code-review-*` via `createEvalSession`)
- `securityTaskPrompt(sessionDir)`, `performanceTaskPrompt(sessionDir)`, `validatorTaskPrompt(sessionDir, workspaceRoot)` — same **shape** as [SKILL.md](../.cursor/skills/ai-code-review/SKILL.md) (absolute Read/Write paths)
- `AI_CODE_REVIEW_SESSION_DIR` — set by the harness when seeding workspaces or E2E diffs
- `buildComponentHarnessPrompt()` — one Task only; harness agent `cwd` is the **monorepo root**; Task lines use **absolute** session paths
- `MODEL_ID` and `SETTING_SOURCES` (`["project"]`) matching `reviewer-runner` `agent.ts`

E2E uses `buildReviewPrompt` + `runReviewAgent` from `packages/reviewer-runner` (same as CI).

Drift is caught by `npm test -w evals` (`invocation.test.ts`).

## Deterministic lib (`npm test -w evals`)

| Module | Role |
|--------|------|
| `lib/expect.ts` | Parse and validate `expect.json` |
| `lib/session.ts` | `mkdtemp` session dir + `session-manifest.json` |
| `lib/workspace.ts` | Copy fixture + frozen inputs into temp workspace + session IPC |
| `lib/structural.ts` | JSON + schema gates |
| `lib/judge.ts` | LLM-as-judge (live evals only) |
| `lib/assert-case.ts` | Structural → judge → optional `validator_funnel` |
| `lib/run-component.ts` | Analyzer (1 retry) and validator (no retry) harness |
| `lib/run-e2e.ts` | Worktree + full orchestrator |
