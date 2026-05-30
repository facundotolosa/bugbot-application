# Plan: Pipeline observability (pre-analyzer + end-to-end)

**Spec:** [spec.md](./spec.md)  
**Plan status:** Draft

## Prerequisites

- [x] Spec reviewed; open questions **Resolved** or **Deferred** (Q5 deferred — no blockers)
- [ ] Human approves this plan before `/implement`
- [x] Specs 01–04 delivered: incremental orchestration, analyzers, validator funnel, `filterFindingsForPost`
- [x] Node.js **20+**, npm workspaces; `npm test -w reviewer-runner` green today
- [x] `.ai-code-review/` gitignored (artifacts under `run-artifacts/` inherit ignore)

## Acceptance criteria → phases

| Criterion (spec) | Phase |
|------------------|-------|
| `logger.ts` palette; `NO_COLOR` / `FORCE_COLOR` / non-TTY plain mode | 1 |
| CI colored wrapper lines (`FORCE_COLOR=1` in workflow) | 7 |
| Pre-agent header/meta, incremental vs full, known-issues count, paths | 3 |
| `log.prompt` full orchestrator prompt + char/known-issue meta | 3 |
| `[orchestrator]` prefix; strip markdown bold/fences from streamed lines | 2 |
| Styled `subAgentLaunched` / `subAgentDone` only for Task lifecycle | 2 |
| Zero `[agent] tool_call` / `tool_use` / `task` on stdout (regression) | 2 |
| Post-agent findings count, inline post summary, tracking, Review Summary, `done` | 4 |
| Incremental skip: warn + summary `0 (skipped…)` + exit 0, no agent | 4 |
| Skill: emoji blocks, TodoWrite checklist, consolidated block, final path line | 5 |
| Machine lines `Analyzers:` / `Validator funnel:` preserved | 5 |
| Agent failure: tracking unchanged, non-zero exit with guidance | 4 |
| Missing `findings.json` after success → error → orchestrator logs + `run-artifacts/` | 4 |
| `run-artifacts/manifest.json`, `orchestrator.json`, `subagents/*.json` | 6 |
| GitHub Actions `upload-artifact` `ai-review-run-artifacts` | 7 |
| Unit tests: logger plain/color, stream prefix/strip, SDK noise silent | 1, 2 |

## Phases

_Each phase is a vertical slice (TDD tracer bullets in `packages/reviewer-runner`). Skill/orchestrator behavior is validated manually until CI agent run in Phase 7._

---

### Phase 1: Wrapper logger module

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | `logger.ts` implements the spec Visual design API with ANSI when enabled and plain glyphs when disabled. |

#### Steps

1. **RED→GREEN** `packages/reviewer-runner/src/logger.test.ts`:
   - `NO_COLOR` set → `header`/`ok`/`warn` output has no `\x1b[` escapes.
   - Non-TTY without `FORCE_COLOR` → plain text.
   - `FORCE_COLOR=1` (or `CI=true` + `FORCE_COLOR=1`) without TTY → escape codes present.
   - Snapshot or exact-match tests for `header`, `meta`, `step`, `ok`, `warn`, `error`, `done`, `prompt` (box + dim meta line), `summary`, `subAgentLaunched`, `subAgentDone` (success + failure glyph).
2. **GREEN** `packages/reviewer-runner/src/logger.ts`:
   - `shouldUseColor()`: respect `NO_COLOR`; enable on TTY or `FORCE_COLOR` (non-empty, not `0`).
   - ANSI helpers per spec table (cyan/green/yellow/red/dim/bold); `warn`/`error` → stderr.
   - Export all API functions from spec § Layer 1.
3. Re-export from `index.ts` if other packages need logger (optional; runner-internal only is fine).

#### Verification

- [ ] `npm test -w reviewer-runner -- src/logger.test.ts` passes
- [ ] `rg 'console\.(log|error)' packages/reviewer-runner/src/logger.ts` — logger is the only place that formats ANSI (consumers call `logger.*` later)

#### Notes

- Prefer small pure helpers (`stripAnsi` for tests) over coupling tests to terminal detection internals.

---

### Phase 2: Quiet SDK stream + orchestrator forwarding

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | `agent-stream.ts` forwards only orchestrator assistant text (prefixed, markdown-stripped) and derives sub-agent lifecycle lines from Task `tool_call` events—no raw SDK noise. |

#### Steps

1. **RED→GREEN** `packages/reviewer-runner/src/agent-stream.test.ts` (new):
   - `formatOrchestratorLine(text)` → `[orchestrator] ` prefix (dim cyan when color on), strips `**` and fenced-code markers line-by-line.
   - Fixture SDK messages: `assistant`+`tool_use`, `tool_call` (non-Task), `task`, `system`, `status`, `thinking` → **no** stdout (spy `console.log` / `process.stdout.write`).
   - `tool_call` with Task name / terminal status → calls `logger.subAgentLaunched` / `subAgentDone` with human description (map `subagent_type` or description field from SDK shape—inspect `@cursor/sdk` `SDKMessage` types in-repo).
   - Regression: output must not match `/\[agent\] (tool_call|tool_use|task)/`.
2. **GREEN** refactor `agent-stream.ts`:
   - Split `stripOrchestratorMarkdown`, `forwardOrchestratorText`, internal `SubAgentTracker` (start time, description).
   - `logAgentStreamEvent` uses `logger` for sub-agent lines only.
3. Wire `agent.ts`: remove `[agent] started/finished` raw logs; use `logger.step` / `logger.ok` for run id and completion; keep stream loop calling `logAgentStreamEvent`.

#### Verification

- [ ] `npm test -w reviewer-runner -- src/agent-stream.test.ts` passes
- [ ] `rg '\[agent\]' packages/reviewer-runner/src` — no matches outside tests/fixtures

#### Notes

- If SDK Task events lack a stable human description, derive from `subagent_type` slug (e.g. `ai-code-review-security-analyzer` → `security analyzer`).
- Spec Q3 final decision: **never** print `thinking` on stdout (artifact only in Phase 6).

---

### Phase 3: Pre-agent wrapper timeline

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | Before `Agent.create`, operators see a styled banner: PR/repo meta, mode, skip hints, artifact paths, full prompt box, then “Launching Cursor agent…”. |

#### Steps

1. **RED→GREEN** extend `agent.test.ts` / new `cli-banner.test.ts` (inject logger mock or capture stdout):
   - `buildReviewPrompt` no longer references “mandatory diff run summary” (replaced by skill emoji blocks—align in Phase 5; stub expectation here or update in same phase).
2. **GREEN** migrate pre-agent logging:
   - `cli.ts`: `logger.header` run title; `logger.meta` for repo root, base/head SHAs, target branch, dry-run/skip flags; delegate to orchestration for scope details.
   - `git-scope.ts`: replace `logReviewMode` / `logReviewScope` `console.log` with `logger.meta` / `logger.step`.
   - `orchestrate-review.ts`: before `runAgent`, log incremental vs full, skip reason (if applicable), known-issues count, `pr-files.txt` / `known-issues.json` paths.
   - `agent.ts`: `logger.prompt(prompt, { chars, knownIssues })` then `logger.step("Launching Cursor agent…")` + run id via `logger.meta`.
3. Update `orchestrate-review.test.ts` / `git-scope.test.ts` assertions from `[review] …` strings to logger output or spy on `logger` module.

#### Verification

- [ ] `npm test -w reviewer-runner` passes (updated orchestration/git-scope tests)
- [ ] `npm run build -w reviewer-runner && npm run review -w reviewer-runner -- --dry-run --base <sha> --head <sha>` shows header → meta → scope steps without `CURSOR_API_KEY` (local manual spot-check)

#### Notes

- `buildReviewPrompt` step 3 should point at skill **Progress visibility** / emoji 📊 block, not plain mandatory diff (coordinate with Phase 5).

---

### Phase 4: Post-agent wrapper + error paths

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | After agent (or skip), wrapper prints findings/post/tracking summary table and exits cleanly; failures leave tracking untouched with actionable errors. |

#### Steps

1. **RED→GREEN** `orchestrate-review.test.ts` / `post-review` integration tests:
   - **Skipped** incremental: `logger.warn` + `logger.summary` with `0` findings label including skip reason; `runAgent` not called; exit path returns `skipped`.
   - **Completed**: logs findings count, PR-scope filter drop count when `report.findings.length > filtered.length`, inline post plan.
   - Agent throws → tracking upsert not called (existing behavior; assert `logger.error` or stderr).
   - Missing findings file message mentions `[orchestrator]` and `run-artifacts/` (adjust `agent.ts` catch copy).
2. **GREEN**:
   - `orchestrate-review.ts`: replace ad-hoc `console.log` with `logger.*`; `logger.summary` Review Summary fields (mode, findings, posted, skipped, tracking id).
   - `github.ts` / `postInlineReview` path: `logger.step`/`ok`/`warn` per spec Layer 4 (duplicate, out-of-scope, posted `path:line`, totals); tracking create/update via `logger.ok`.
   - `cli.ts`: final `logger.done` instead of plain “Review completed…”
   - Dry-run: keep comment body preview but via `logger.step` or dim block (not raw `--- path:line ---` only if spec allows—prefer structured `meta`).
3. `filterFindingsForPost`: return or log dropped-out-of-PR count for summary.

#### Verification

- [ ] `npm test -w reviewer-runner` passes
- [ ] Orchestration tests no longer depend on `[review]` prefix strings

---

### Phase 5: Orchestrator skill — Layer 2 stdout contract

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | Skill documents and enforces human-facing progress: emoji blocks, optional TodoWrite checklist, consolidated close, strict final path line; removes plain mandatory diff block. |

#### Steps

1. Edit `.cursor/skills/ai-code-review/SKILL.md`:
   - Add **Progress visibility** (minimal chat; tools silent; optional TodoWrite keys: `prereq`, `metadata`, `diff`, `analyzers`, `collect`, `validate`, `report`).
   - Add fixed emoji block templates (📋 📊 🔬 📥 ⏭️/✅ 🎯) per spec table.
   - **Remove** § “Mandatory diff run summary (stdout)”; cross-link 📊 block + immediate `Warning:` lines.
   - Add **Consolidated final block** (repeat 📋→📥 + 🎯 severity counts from **final** `findings.json`).
   - Final stdout line: exactly `Report written to: .ai-code-review/findings.json` (edge case: embedded JSON only if write impossible).
   - Explicit **do not print**: Task prompts, tool names, TodoWrite text, long monologues.
2. Update `buildReviewPrompt` in `agent.ts` to reference emoji blocks + consolidated close (remove step 3 mandatory diff).
3. Update `agent.test.ts` expectations accordingly.
4. Update `packages/reviewer-runner/README.md` (stream description: `[orchestrator]`, no `[agent]` tool lines).

#### Verification

- [ ] `npm test -w reviewer-runner -- src/agent.test.ts` passes
- [ ] `rg 'Mandatory diff run summary' .cursor/skills/ai-code-review/` — no matches (section removed)
- [ ] `rg 'Analyzers:|Validator funnel:' .cursor/skills/ai-code-review/SKILL.md` — both machine lines still documented
- [ ] Manual (with `CURSOR_API_KEY`): local review run shows 📊 block + consolidated 🎯 before wrapper post-agent lines (human sign-off)

---

### Phase 6: Run artifacts (Layer 3)

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | After every agent run (success or failure), persist debug JSON under `.ai-code-review/run-artifacts/` without polluting stdout. |

#### Steps

1. **RED→GREEN** `packages/reviewer-runner/src/run-artifacts.test.ts`:
   - Given captured events array + prompt, `writeRunArtifacts(dir, payload)` writes `manifest.json`, `orchestrator.json`, and `subagents/{slug}-{callId8}.json` per Task.
   - `manifest.json` includes `run_id`, model id, timestamps, subagent list.
2. **GREEN** `run-artifacts.ts`:
   - Accumulate stream events in `agent.ts` (or stream wrapper) while streaming.
   - `finally` after stream ends: mkdir `join(repoRoot, ".ai-code-review/run-artifacts")`, write files.
3. Ensure `system` / `thinking` / tool payloads land in `orchestrator.json` only.

#### Verification

- [ ] `npm test -w reviewer-runner -- src/run-artifacts.test.ts` passes
- [ ] Manual: after local agent run, directory exists with expected files (when API key available)

---

### Phase 7: CI color + artifact upload + acceptance sweep

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | GitHub Actions enables ANSI in logs and uploads run artifacts; full test suite and spec validation checklist satisfied. |

#### Steps

1. Edit `.github/workflows/ai-code-review.yml`:
   - `env.FORCE_COLOR: "1"` on review step (and/or job-level).
   - Step after review: `actions/upload-artifact@v4` with `name: ai-review-run-artifacts`, `path: .ai-code-review/run-artifacts/**`, `if: always()` when directory exists.
2. Run full `npm test -w reviewer-runner`.
3. Walk spec **Validation checklist**; fix any straggler `[review]` logs or README drift.

#### Verification

- [ ] `npm test -w reviewer-runner` passes (all tests)
- [ ] Workflow YAML contains `FORCE_COLOR=1` and `upload-artifact` for `run-artifacts`
- [ ] Manual: PR/sync CI run shows colored wrapper lines in Actions log viewer
- [ ] Manual: downloaded artifact `ai-review-run-artifacts` contains `manifest.json` + `orchestrator.json`
- [ ] Spec acceptance criteria table in spec.md — all items checked during `/validate`

---

## Files (estimate)

| Path | Action |
|------|--------|
| `packages/reviewer-runner/src/logger.ts` | Create |
| `packages/reviewer-runner/src/logger.test.ts` | Create |
| `packages/reviewer-runner/src/agent-stream.ts` | Refactor |
| `packages/reviewer-runner/src/agent-stream.test.ts` | Create |
| `packages/reviewer-runner/src/run-artifacts.ts` | Create |
| `packages/reviewer-runner/src/run-artifacts.test.ts` | Create |
| `packages/reviewer-runner/src/agent.ts` | Migrate logging, artifact capture, prompt text |
| `packages/reviewer-runner/src/cli.ts` | Pre/post banner via logger |
| `packages/reviewer-runner/src/orchestrate-review.ts` | Pre/post timeline, summary, skip path |
| `packages/reviewer-runner/src/git-scope.ts` | Logger instead of `[review]` |
| `packages/reviewer-runner/src/github.ts` | Post/tracking logger lines |
| `packages/reviewer-runner/src/post-review.ts` | Optional: expose filter drop count |
| `packages/reviewer-runner/src/*.test.ts` | Update assertions / spies |
| `packages/reviewer-runner/README.md` | Observability docs |
| `.cursor/skills/ai-code-review/SKILL.md` | Progress + emoji blocks + consolidated close |
| `.github/workflows/ai-code-review.yml` | `FORCE_COLOR`, `upload-artifact` |

## Out of scope for this plan

- `read-gh-ai-reviewer-logs` skill filter modes (spec Q5 deferred)
- Agent timeout/cancel hooks
- Bitbucket / non-GitHub hosts
- Multi-batch diff artifacts (`batch-{i}.json`)
- Replacing or extending `heuristics.txt` (untracked local file; not part of spec)

## Notes

- **Spec vs changelog Q3:** Changelog row mentions “thinking local TTY only”; final spec § Stream rules and Q3 resolution require **no** `thinking` on stdout anywhere. Implement per final spec.
- **Vertical slices:** Phases 1–2 deliver testable logging/stream behavior before broad migration (3–4). Skill (5) can land after stream contract so CI logs stay parseable during transition.
- **Dependency order:** Phase 6 should merge after Phase 2 event handling shape is stable (Task tracking + event buffer).

## Changelog

| Date | Change |
|------|--------|
| 2026-05-30 | Initial plan from spec 05 (three-layer observability) |
