# Plan: Evals harness (golden cases + regression)

**Spec:** [spec.md](./spec.md)  
**Plan status:** Done

## Prerequisites

- [x] Spec reviewed; open questions **Resolved** in spec (no blockers)
- [x] Human approves this plan before `/implement`
- [ ] `CURSOR_API_KEY` available locally for full eval verification (not required for Phases 1–3 Vitest-only checks)
- [ ] Node.js **20+**, npm workspaces; `packages/reviewer-runner` builds (`npm run build -w reviewer-runner`)
- [ ] `@cursor/sdk` usable from eval runner (same major as `reviewer-runner`)

## Acceptance criteria → phases

| Criterion (spec) | Phase |
|------------------|-------|
| `evals/` layout + ≥6 golden cases | 4, 5, 6, 7 |
| Invocation parity module ↔ `SKILL.md` verbatim | 2 |
| Analyzer evals (security + performance), two-line prompt only | 4 |
| Validator evals (≥2), three-line prompt; agent refs docs | 5 |
| E2E via `buildReviewPrompt` + `runReviewAgent`, pinned SHAs | 6 |
| `must_find` / `must_not_find` + `judge.rubric`; LLM judge always | 3, 4–7 |
| `npm run eval` clear failure without `CURSOR_API_KEY` | 1 |
| `evals/README.md` (tests vs evals, add case, local-only) | 1, 7 |
| Root `AGENTS.md` lists `evals/` | Already listed; confirm in Phase 7 |

## Phases

_Each phase is a vertical slice. Deterministic code uses Vitest under `evals/` (no LLM). LLM suites verify in Phase 7 with `CURSOR_API_KEY`._

---

### Phase 1: Eval package skeleton + CLI guard

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | Top-level `evals/` exists with runnable `npm run eval` that fails fast when the API key is missing. |

#### Steps

1. Add `evals/package.json` (`type: module`, `private: true`) with scripts: `eval` (main runner), `test` (Vitest for deterministic lib).
2. Add root `package.json` script: `"eval": "npm run eval -w evals"` (and optional aliases `eval:e2e`, `eval:analyzers`, `eval:validator` forwarding `--suite`).
3. Scaffold layout:
   - `evals/cases/{e2e,analyzer-security,analyzer-performance,validator}/`
   - `evals/lib/`, `evals/fixtures/`, `evals/out/` (gitignore `evals/out/`)
   - `evals/config.ts` — defaults: `EVAL_MODEL_ID` / `EVAL_JUDGE_MODEL_ID` → `composer-2.5`, paths for output dir
4. Implement `evals/lib/cli.ts`: parse `--suite`, `--case`, `--refresh-inputs`; if `!process.env.CURSOR_API_KEY`, print one clear message and `process.exit(1)`.
5. Stub `evals/run.ts` (discover cases, print “no cases” or dry-run list until later phases).
6. Write `evals/README.md` (v1): tests vs evals table, `CURSOR_API_KEY`, local-only (no CI workflow), how to add a case (pointer to `expect.json`).

#### Verification

- [x] `npm run eval` exits non-zero with explicit “set CURSOR_API_KEY” message when unset
- [x] `npm test` at repo root still passes (no workspace breakage)
- [x] `npm test -w evals` runs (even if zero tests initially, runner starts)
- [x] `evals/out/` in `.gitignore`

#### Notes

- Root `AGENTS.md` already documents `evals/`; no change required until layout is real (Phase 7 confirmation).

---

### Phase 2: Invocation parity module

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | Single source of truth for `subagent_type` slugs, model id, `settingSources`, and exact Task prompt lines matching `SKILL.md`. |

#### Steps

1. Add `evals/lib/invocation.ts` exporting:
   - `MODEL_ID`, `SETTING_SOURCES`, `WORK_DIR` paths (`.ai-code-review/work/…`, `known-issues.json`)
   - `SUBAGENT_TYPES` (`security`, `performance`, `validator`)
   - `securityTaskPrompt()`, `performanceTaskPrompt()`, `validatorTaskPrompt()` — **byte-identical** to SKILL.md blocks (lines 195–197, 202–204, 242–245)
   - `buildComponentHarnessPrompt(subagentType, taskPromptLines)` — minimal eval-only wrapper: launch **one** Task with given type + lines; do **not** paste agent rules
2. **RED→GREEN** `evals/lib/invocation.test.ts`:
   - Snapshot or exact string asserts for all three Task prompts
   - Assert `subagent_type` values match `.cursor/agents/*.md` frontmatter `name`
3. Document in `evals/README.md` § “Invocation parity” that evals import this module; drift = test failure.
4. _(Optional, same phase if trivial)_ Re-export from `packages/reviewer-runner/src/eval-invocation.ts` that re-exports `evals/lib/invocation.ts` — **only** if E2E runner needs shared constants without circular deps; otherwise keep parity module eval-only per spec.

#### Verification

- [ ] `npm test -w evals` passes (`invocation.test.ts`)
- [ ] Manual: copy-paste `securityTaskPrompt()` output vs `SKILL.md` analyzer section — identical
- [ ] `rg` shows no duplicate prompt string literals outside `invocation.ts` + `SKILL.md` + test fixtures

#### Notes

- **Judge model (Q3):** v1 uses same default as reviewers (`composer-2.5`); `EVAL_JUDGE_MODEL_ID` optional override documented in `evals/config.ts`. No cheaper default in v1.

---

### Phase 3: Workspace seeding, structural gates, LLM judge

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | Deterministic case setup + structural validation + LLM-as-judge for every `must_find` / `must_not_find`. |

#### Steps

1. Define `evals/lib/types.ts` + `expect.schema` validation (Zod or hand-rolled): `suite`, `must_find[]`, `must_not_find[]`, optional `validator_funnel`, required `judge.rubric`.
2. `evals/lib/workspace.ts`:
   - Copy `evals/fixtures/<id>/` or case `fixture/` → temp dir (`mkdtemp` under `evals/out/` or OS tmp)
   - Create `.ai-code-review/work/`; copy frozen `cases/.../inputs/*` → fixture paths
   - Return `{ cwd, cleanup }`
3. `evals/lib/structural.ts`:
   - Import `parseFindingsFile` / `parseValidatorOutput` from existing packages (reviewer-runner + skill scripts paths as today)
   - Gates: valid JSON, schema v2, file exists — **do not** pass/fail expectations without judge
4. `evals/lib/judge.ts`:
   - Given `expect.json` entry + findings JSON (or analyzer output), call Cursor agent/SDK with rubric + structured ask (pass/fail + reason)
   - Record transcript under `evals/out/<run-id>/<case-id>/judge-*.json`
5. `evals/lib/assert-case.ts` orchestrates: structural → judge for each expectation → optional `validator_funnel` numeric checks on mapped `filter_summary`
6. **RED→GREEN** tests: workspace copy (fixture tree + inputs), `expect.json` parse errors, judge prompt builder (no API call — mock or snapshot user message only)

#### Verification

- [ ] `npm test -w evals` passes workspace + schema tests
- [ ] With mocked judge (test double), `assertCase` returns pass/fail from rubric result shape
- [ ] Structural gate rejects malformed JSON without invoking judge

#### Notes

- Validator component evals: after LLM validator step, map via `mapValidatorToFindingsReport` for assertions (deterministic), per spec.

---

### Phase 4: Component harness + analyzer golden cases

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | Run security and performance analyzer evals via harness agent + single Task; ≥2 analyzer cases with frozen `diff.json`. |

#### Steps

1. `evals/lib/run-component.ts`:
   - `Agent.create` with `local: { cwd: fixtureRoot, settingSources: invocation.SETTING_SOURCES }`, model from config
   - Send `buildComponentHarnessPrompt(...)`; stream/wait; read output file path from invocation
   - **One retry** on missing/invalid analyzer output (record `retry: true` in case result)
2. Golden case **`analyzer-security/leaked-key`** (names illustrative):
   - `evals/fixtures/leaked-key/` — minimal `src/auth.ts` with hardcoded API key in diff hunk
   - `cases/analyzer-security/leaked-key/inputs/diff.json` (frozen)
   - `expect.json` with `must_find` + `judge.rubric`
3. Golden case **`analyzer-performance/n-plus-one`**:
   - Fixture with loop + per-row fetch pattern in diff
   - Frozen `diff.json`; `must_find` performance issue; `judge.rubric`
4. Wire `evals/run.ts` to run analyzer suites, print per-case duration / retry / judge flag
5. `--refresh-inputs`: optional path runs `prepare-diff` in fixture context and overwrites case `inputs/diff.json` (document in README)

#### Verification

- [ ] `npm test -w evals` still green
- [ ] `CURSOR_API_KEY=… npm run eval -- --suite analyzer-security` passes `leaked-key` locally
- [ ] `CURSOR_API_KEY=… npm run eval -- --suite analyzer-performance` passes `n-plus-one` locally
- [ ] Artifacts appear under `evals/out/<run-id>/`
- [ ] Task prompt in run logs matches `invocation.ts` (two lines only)

---

### Phase 5: Validator golden cases

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | ≥2 validator cases (positive funnel + filter/negative) with three-line Task prompt only; **no** validator retry. |

#### Steps

1. Extend `run-component.ts` for validator output path + **no retry** on missing/invalid `validator-output.json`
2. Case **`validator/dedup-positive`**:
   - Frozen `inputs/raw-findings.json` (duplicate / root-cause pair), `known-issues.json`
   - `expect.json`: `must_find` on surviving finding; optional `validator_funnel.final_output_min/max`
3. Case **`validator/fp-filter-negative`**:
   - Raw findings include known false-positive pattern (test-only noise, style nit); `must_not_find` + rubric
4. Post-run: `parseValidatorOutput` + `mapValidatorToFindingsReport` for judge input and funnel counts

#### Verification

- [ ] `CURSOR_API_KEY=… npm run eval -- --suite validator` passes both cases locally
- [ ] Missing validator output fails case without retry (simulate by corrupting path in dry test or unit test hook)
- [ ] Validator Task prompt is exactly three lines from `invocation.ts`

---

### Phase 6: E2E evals (pinned SHAs + ledger-lite scope)

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | ≥2 E2E cases using `buildReviewPrompt` + `runReviewAgent` against this monorepo with frozen scope files. |

#### Steps

1. Add `evals/cases/e2e/_pins.json` (or per-case `pins.json`):
   - `base_sha`, `head_sha` (full SHAs, **never** `main`)
   - `source_ref` / `target_ref` strings for prompt
2. **Factory commits (one-time, documented in case README):**
   - Branch or tags e.g. `eval/e2e-base`, `eval/e2e-head` with intentional `packages/ledger-lite/` changes (security issue in one case, performance or mixed in second)
   - Record SHAs in `_pins.json` after push
3. Per E2E case `inputs/`:
   - Frozen `pr-files.txt` (only `packages/ledger-lite/...` paths)
   - Frozen `known-issues.json`
   - Copy into repo `.ai-code-review/` before `runReviewAgent` (checkout `head_sha` in worktree or use repo root with env guard)
4. `evals/lib/run-e2e.ts`:
   - Import `buildReviewPrompt`, `runReviewAgent`, `parseFindingsFile` from `reviewer-runner` (built `dist/` or `tsx` alias — match workspace convention)
   - Same `SKILL_PATH`, `MODEL_ID`, `settingSources: ["project"]` as `agent.ts`
5. Cases (minimum 2):
   - **`e2e/ledger-security`** — expects security finding in final `findings.json`
   - **`e2e/ledger-pipeline`** — second scenario (performance and/or validator path; document intent in case `README.md`)
6. E2E assertions: `parseFindingsFile` + LLM judge on final findings only

#### Verification

- [ ] `git show <head_sha> --stat` touches only `packages/ledger-lite/` (or documented exceptions)
- [ ] `CURSOR_API_KEY=… npm run eval -- --suite e2e` passes both cases locally
- [ ] Prompt built by `buildReviewPrompt` includes frozen `pr-files.txt` / `known-issues.json` paths
- [ ] No floating `main` in pin config (`rg 'main' evals/cases/e2e` only in prose, not as ref)

#### Notes

- **Spec gap watch:** If pin SHAs cannot be created in-repo during implement, stop and ask human to approve eval branch push before merging plan execution.

---

### Phase 7: Runner integration, metrics, full validation

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | Single `npm run eval` runs all suites; metrics + filters; docs and spec validation checklist complete. |

#### Steps

1. `evals/run.ts`: discover all cases; filter `--suite` / `--case`; aggregate `passed/total`, duration, retry, judge used
2. Ensure **≥6** cases total across suites (count in README table)
3. Finalize `evals/README.md`: invocation parity, `--refresh-inputs`, env vars, artifact layout, local-only v1
4. Confirm root `AGENTS.md` `evals/` row accurate
5. Run spec **Validation checklist** (manual spot-check: no long rules duplicated in eval prompts)

#### Verification

- [ ] `npm test` (root) passes — no regression in `reviewer-runner` / workspaces
- [ ] `npm test -w evals` passes
- [ ] `npm run eval` without key → clear error
- [ ] `CURSOR_API_KEY=… npm run eval` passes all v1 cases (document date/key in plan changelog when run)
- [ ] `evals/README.md` states **local-only**, no GitHub Actions workflow
- [ ] All spec acceptance criteria checked off in `/validate`

---

## Files (estimate)

| Path | Action |
|------|--------|
| `evals/package.json` | Create |
| `evals/run.ts` | Create |
| `evals/config.ts` | Create |
| `evals/README.md` | Create / update |
| `evals/.gitignore` | Create (`out/`) |
| `evals/lib/invocation.ts` | Create |
| `evals/lib/invocation.test.ts` | Create |
| `evals/lib/types.ts`, `workspace.ts`, `structural.ts`, `judge.ts`, `assert-case.ts` | Create |
| `evals/lib/run-component.ts`, `run-e2e.ts`, `cli.ts` | Create |
| `evals/lib/*.test.ts` | Create (deterministic slices) |
| `evals/cases/**/expect.json`, `inputs/*`, optional `README.md` | Create (≥6 cases) |
| `evals/fixtures/**` | Create (minimal trees for component cases) |
| `evals/cases/e2e/_pins.json` | Create |
| `package.json` (root) | Modify — `eval` script |
| `.gitignore` | Modify — `evals/out/` |
| `packages/reviewer-runner/src/eval-invocation.ts` | Optional re-export |
| `.agents/specs/06-evals-harness/spec.md` | Status → Done only after `/validate` |

## Out of scope for this plan

- GitHub Actions workflow for evals (v1 local-only per spec Q6)
- Moving skill `*.test.ts` to root `npm test`
- Precision/recall dashboards, production feedback loop
- Multi-model / temperature matrix
- Evals for GitHub posting, tracking comment, inline formatting

## Notes

| Topic | Decision |
|-------|----------|
| Harness vs full skill | E2E = `runReviewAgent`; components = harness + one Task (`invocation.ts`) |
| Frozen inputs | Default copy from `cases/.../inputs/`; `--refresh-inputs` regenerates via `prepare-diff` |
| Judge | Always for expectations; structural gates only pre-check |
| E2E fixture | Monorepo + pinned SHAs + ledger-lite `pr-files.txt`; components use `evals/fixtures/` |
| Vitest vs evals | All deterministic logic in `npm test -w evals`; LLM cases in `npm run eval` |

## Changelog

| Date | Change |
|------|--------|
| 2026-05-31 | Initial plan from spec 06-evals-harness (7 phases, acceptance mapping) |
| 2026-05-31 | Plan approved; status Done; prerequisite checked |
| 2026-05-31 | Phase 1 done: evals workspace, CLI guard, stub runner, README, root `npm run eval` |
