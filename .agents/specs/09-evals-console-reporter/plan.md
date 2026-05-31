# Plan: Evals console reporter (Vitest-style UX)

**Spec:** [spec.md](./spec.md)  
**Plan status:** Done

## Prerequisites

- [x] Spec reviewed; open questions **Resolved** in spec (OQ1–4)
- [x] Human approves plan before `/implement`
- [x] Node.js **20+**, npm workspaces; `packages/reviewer-runner` builds
- [x] `CURSOR_API_KEY` for manual `npm run eval` verification (Phases 5–6; not required for unit tests)

## Acceptance criteria → phases

| Criterion (spec) | Phase |
|------------------|-------|
| Full pending tree at run start | 2, 3 |
| Default run: no orchestrator / prompt box / SDK INFO on stdout | 1, 5 |
| PASS/FAIL, duration, `judge=yes` / `retry=yes` when true | 2 |
| Spinner on TTY; static marker in CI | 4 |
| Exactly one failure line from `CaseRunResult.error` | 2 |
| No `taskPrompt` dump by default | 3 |
| `--verbose` / `EVAL_VERBOSE=1` restores today’s visibility | 3 |
| E2E `run-artifacts/` unchanged in quiet mode | 1 |
| `npm test -w evals` reporter tests (no API key) | 2, 4 |
| Exit code `0` / `1` unchanged | 3 |
| `evals/README.md` documents verbose | 6 |
| Production CI log volume unchanged when `logging` omitted | 1 |

## Phases

_Each phase is a vertical slice (TDD where code changes). Deterministic checks use `npm test -w evals`; LLM checks use `npm run eval` with API key._

---

### Phase 1: `logging: "quiet"` on `runReviewAgent`

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | Reviewer-runner supports eval-only quiet mode: artifacts and `streamEvents` unchanged; no prompt box or orchestrator stdout. |

#### Steps

1. Extend `RunReviewAgentOptions` in `packages/reviewer-runner/src/agent/agent.ts` with optional `logging?: "default" | "quiet"` (default `"default"` when omitted).
2. When `logging === "quiet"`:
   - Skip `log.prompt`, `log.step`, `log.ok`.
   - In the stream loop, still `streamEvents.push(event)`; call `logAgentStreamEvent` only when `logging !== "quiet"` (or add `quiet` param to `logAgentStreamEvent` / `flushOrchestratorStream` — prefer minimal surface: guard at call site in `agent.ts`).
3. **RED→GREEN** `packages/reviewer-runner/src/agent/agent.test.ts` (or dedicated test file): mock `logger` + `agent-stream`; assert `orchestratorLine` / `prompt` / `step` / `ok` are **not** invoked when `logging: "quiet"`, and **are** invoked when omitted or `"default"`.
4. Run existing `reviewer-runner` tests to confirm default behavior unchanged.

#### Verification

- [x] `npm test -w reviewer-runner` passes
- [x] New quiet-mode test passes without network/SDK
- [x] `rg 'logging.*quiet' packages/reviewer-runner` shows option on `RunReviewAgentOptions` only (no CI/cli default change)

#### Notes

- Do **not** add env-only quiet in `logger.ts` unless hook option proves insufficient during implement (spec defers to option).
- Error messages that reference “[orchestrator] lines above” remain valid in verbose mode; quiet eval failures rely on `evals/out/` artifacts.

---

### Phase 2: `EvalReporter` module (plain output, no TTY tricks)

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | Harness owns stdout formatting: pending tree, finalized case lines, failure sub-line, Vitest-style summary — testable with color off. |

#### Steps

1. Add `evals/lib/reporter.ts` exporting `EvalReporter` with:
   - `setVerbose(verbose: boolean)`
   - `startRun(runId, cases: DiscoveredCase[])` — header + **full** suite/case tree in **pending** state (`○` or dim `RUN`; no color required)
   - `startCase(suite, caseId)` — mark case **running** (static `…` for this phase; spinner in Phase 4)
   - `endCase(result: CaseRunResult)` — `✓` / `✗`, duration, `judge=yes` / `retry=yes` only when true; one indented failure line if `result.error`
   - `printSummary(summary: EvalRunSummary, runId: string)` — footer per spec (`Tests:`, `Time:`, `Judge:`, `Retries:`, by-suite, `Artifacts: …`)
2. Reuse `shouldUseColor`, `green` / `red` from `packages/reviewer-runner/src/support/logger.ts` for pass/fail glyphs when enabled.
3. Group cases by `suite` (preserve discovery order within suite).
4. **RED→GREEN** `evals/lib/reporter.test.ts`:
   - `startRun` prints all pending rows before any `endCase`
   - `endCase` pass line includes duration and badges only when `judgeUsed` / `retry`
   - `endCase` fail prints exactly one indented error line
   - `printSummary` matches Vitest-style layout (snapshot or string contains checks)
   - Force `shouldUseColor` off (inject env / mock) for stable snapshots

#### Verification

- [x] `npm test -w evals -- reporter` passes
- [x] Reporter tests do not require `CURSOR_API_KEY`

#### Notes

- Keep `buildEvalRunSummary` in `summary.ts`; reporter owns **display** only.
- Exact glyphs/spacing are flexible; tests lock behavior that matters (pending → result → summary).

---

### Phase 3: Wire runner — CLI verbose, reporter loop, quiet E2E

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | `npm run eval` uses reporter by default; verbose restores legacy dumps; E2E passes `logging: "quiet"`. |

#### Steps

1. `evals/lib/cli.ts`: add `verbose: boolean`; parse `--verbose`; `verbose = argv flag || process.env.EVAL_VERBOSE === "1"` (CLI wins if both set — document in comment).
2. **RED→GREEN** `evals/lib/cli.test.ts`: `--verbose` and `EVAL_VERBOSE=1` cases.
3. Refactor `evals/run.ts`:
   - Instantiate `EvalReporter`, `setVerbose(options.verbose)`
   - Replace per-case `console.log` block with `startRun` → loop (`startCase` → `runGoldenCase` → `endCase`)
   - Remove default `taskPrompt` dump; when `verbose`, print task prompt after case (today’s behavior)
   - `printSummary` + artifacts path; keep exit code logic
4. `evals/lib/run-e2e.ts`: pass `logging: options.verbose ? "default" : "quiet"` into `runReviewAgent` (thread `verbose` through `runGoldenCase` options).
5. Optional: extend `run-case` / component path only if harness agents gain stdout noise in manual runs (component harness already drains stream silently).

#### Verification

- [x] `npm test -w evals` passes (cli + reporter + existing lib)
- [x] `npm run eval` with missing key still fails fast (unchanged)
- [x] Code review: `run.ts` does not call `console.log` for case progress except via reporter (harness errors on stderr unchanged)

#### Notes

- `refresh-inputs` banner can stay as a single meta line from reporter or `run.ts` before tree (keep explicit, not buried).

---

### Phase 4: TTY live updates + spinner + CI static marker

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | Running case updates its pre-listed line in place on TTY; spinner animates unless `CI=true` or non-TTY. |

#### Steps

1. In `EvalReporter`, detect `process.stdout.isTTY` and `process.env.CI === "true"`.
2. **Running state:** animated spinner frames on TTY; static `…` or `RUN` when non-TTY or CI.
3. **In-place update:** on TTY, erase/redraw the case line (ANSI clear line / cursor up) so the tree does not grow; non-TTY append a single running line if needed.
4. **RED→GREEN** tests with mocked `stdout` / `isTTY`:
   - CI + TTY → no spinner animation (static indicator)
   - Transition pending → running → pass updates same logical row (assert written sequences or snapshot with fake stream)

#### Verification

- [x] `npm test -w evals -- reporter` passes including TTY/CI cases
- [ ] Manual: local TTY shows spinner on one long E2E case (Phase 6)

#### Notes

- Avoid extra blank lines in CI (`spec` § CI behavior).
- Only one case runs at a time — single active spinner is sufficient.

---

### Phase 5: SDK bootstrap noise suppression (eval quiet)

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | Quiet eval runs suppress Cursor SDK `INFO … load completed` on stdout/stderr without affecting verbose mode or production CLI. |

#### Steps

1. **Investigate** (during implement): SDK env vars, stderr redirect — likely no public hook.
2. **Reuse** existing `installProcessGuards()` from `packages/reviewer-runner/src/support/process-guard.ts` (patches `stdout`/`stderr.write`, filters `SDK_INFO_LOAD_LINE`). Production `cli.ts` already calls it; eval `run.ts` does **not** today.
3. Call `installProcessGuards()` at eval startup when **not** verbose (before any agent calls). Skip when `--verbose` / `EVAL_VERBOSE=1`.
4. Document chosen approach below in **SDK suppression (decision)**.
5. Component `runHarnessAgent` benefits automatically once guards installed at process level.

#### Verification

- [x] `npm test -w reviewer-runner -- process-guard` still passes
- [ ] Manual quiet `npm run eval`: no `LocalCursorRulesService load completed` lines on stdout (spot check one case)
- [ ] Manual `npm run eval -- --verbose`: SDK INFO may appear (acceptable)

#### SDK suppression (decision)

| Approach | Result |
|----------|--------|
| SDK env / API hook | No public log-level hook found on `@cursor/sdk` Agent.create |
| **Chosen** | `installProcessGuards()` at eval `run.ts` startup when quiet (before agent calls) |
| Fallback filter | Already implemented in `process-guard.ts` (`stripSdkBootstrapNoise`) |

#### Notes

- Best-effort only per spec; do not guarantee silence of all third-party logs.
- Do not change production `reviewer-runner` default: guards stay on CI cli entry only; eval installs guards only in quiet eval runs.

---

### Phase 6: Docs + end-to-end validation

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | README and spec validation checklist satisfied; no regression to production logging. |

#### Steps

1. Update `evals/README.md` CLI table: `--verbose`, `EVAL_VERBOSE=1` (CLI overrides env).
2. Run full deterministic suite and spot-check LLM evals per spec validation checklist.
3. Mark spec/plan verification items complete during `/validate`.

#### Verification

- [x] `npm test -w evals` passes
- [x] `npm test` at repo root passes (or documented scope)
- [ ] `npm run eval` (with key): default output scannable; failed case shows single judge line (e.g. `ledger-pipeline`)
- [ ] `npm run eval -- --verbose`: orchestrator stream + task prompt visible for one E2E case
- [x] GitHub Actions / local `reviewer-runner` without `logging: quiet` — log volume unchanged (no code path change when option omitted)
- [x] `evals/README.md` updated

---

## Files (estimate)

| Path | Action |
|------|--------|
| `evals/lib/reporter.ts` | Create |
| `evals/lib/reporter.test.ts` | Create |
| `evals/run.ts` | Modify — delegate to reporter |
| `evals/lib/cli.ts` | Modify — `verbose`, `--verbose` |
| `evals/lib/cli.test.ts` | Modify |
| `evals/lib/run-e2e.ts` | Modify — pass `logging` |
| `evals/lib/run-case.ts` | Modify — thread `verbose` to E2E |
| `evals/lib/summary.ts` | Modify (optional) — only if summary builder needs fields for reporter |
| `packages/reviewer-runner/src/agent/agent.ts` | Modify — `logging` option |
| `packages/reviewer-runner/src/agent/agent-quiet-logging.test.ts` | Create — quiet logging tests |
| `evals/README.md` | Modify — verbose flag / env |
| `.agents/AGENTS.md` | Modify — spec status |

## Out of scope for this plan

- Parallel case execution, junit/HTML reports, production CI quiet default
- Changing golden cases, judge rubrics, or spec 06 behavior
- Guaranteed suppression of all third-party log lines

## Changelog

| Date | Change |
|------|--------|
| 2026-05-31 | Initial plan from spec; mapped AC → phases; documented `process-guard` reuse for SDK INFO |
| 2026-05-31 | Implemented all phases: quiet logging, EvalReporter, CLI verbose, TTY spinner, process guards, README |
