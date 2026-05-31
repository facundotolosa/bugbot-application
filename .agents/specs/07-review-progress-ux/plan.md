# Plan: Review progress UX (local todos + English stdout + ephemeral session)

**Spec:** [spec.md](./spec.md)  
**Plan status:** Done

## Prerequisites

- [x] Spec reviewed; open questions Q1–Q4 **Resolved** in spec
- [x] Human approves this plan before `/implement`
- [x] Specs 01–05 delivered: skill orchestrator, analyzers, validator, pipeline observability (`[orchestrator]` stream, `run-artifacts/**`)
- [x] Spec 06 eval harness in progress — Phase 6 coordinates path changes without blocking runner/skill work
- [x] Node.js **20+**; `npm test -w reviewer-runner` green today

## Acceptance criteria → phases

| Criterion (spec) | Phase |
|------------------|-------|
| 7 todos on first tool call; fixed `id` + `content`; no extra todos | 1 |
| Todo state machine; one `in_progress` at a time | 1 |
| English-only orchestrator status lines (canonical table) | 2 |
| `buildReviewPrompt` includes English stdout requirement | 3 |
| No `work/` after success; `findings.json` exists | 4, 5 |
| IPC under temp session during run | 4 |
| Task prompts use session paths (CI `orchestrator.json` / artifact) | 4, 5 |
| Temp removed; `run-artifacts/session/` has IPC snapshot | 5 |
| CI artifact includes `session/` + spec 05 SDK trace | 5, 7 |
| Spec 05 preserved (emoji blocks, machine lines, prefix, no SDK noise) | 2, 7 |
| `npm test -w reviewer-runner`; evals updated if `work/` refs | 3, 6, 7 |
| `references/progress-todos.md` matches SKILL Step 0 | 1 |
| `validator-summary.json` at `.ai-code-review/` root | 4, 5 |

## Phases

---

### Phase 1: Mandatory TodoWrite (IDE progress)

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | Step 0 is normative: first tool call is `TodoWrite` with exactly 7 items; state machine documented and aligned with skill steps. |

#### Verification

- [x] `references/progress-todos.md` exists; content strings match spec table character-for-character
- [x] `SKILL.md` states Step 0 is **first tool call** before any other tool
- [x] `rg 'optional.*TodoWrite|TodoWrite keys' .cursor/skills/ai-code-review/SKILL.md` — no “optional” TodoWrite wording
- [x] If contract test added: `npm test -w reviewer-runner -- skill-contract` passes

---

### Phase 2: English-only orchestrator stdout

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | Normative one-sentence English lines before each phase; chat may stay Spanish per `concise-responses.md`, stdout may not. |

#### Verification

- [x] `SKILL.md` contains exact strings from spec “Canonical English stdout lines” table (grep each sentence)
- [x] `SKILL.md` explicitly forbids Spanish on stdout
- [x] `npm test -w reviewer-runner` passes (no code change required; regression guard)

---

### Phase 3: Runner prompt — English stdout directive

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | `buildReviewPrompt` tells the orchestrator all stdout status lines must be English (one short sentence per step). |

#### Verification

- [x] `npm test -w reviewer-runner -- src/agent.test.ts` passes
- [x] `npm test -w reviewer-runner` passes (stream/logger regression)

---

### Phase 4: Ephemeral session IPC + durable `.ai-code-review/` layout

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | Orchestrator uses `$TMPDIR/ai-code-review-*` (or `AI_CODE_REVIEW_SESSION_DIR`) for all analyzer/validator IPC; durable tree has no `work/`. |

#### Verification

- [x] `rg '\\.ai-code-review/work' .cursor/skills/ai-code-review/SKILL.md .cursor/agents/` — no persistent `work/` contract (examples may mention “deprecated” once if needed)
- [x] `SKILL.md` documents `session-manifest.json` and `AI_CODE_REVIEW_SESSION_DIR`
- [x] `SKILL.md` Task prompt examples show absolute session paths pattern

---

### Phase 5: Session lifecycle, snapshot, cleanup

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | After durable outputs written, copy session tree to `run-artifacts/session/`, best-effort delete temp; abort path keeps temp with English warning. |

#### Verification

- [x] `SKILL.md` describes copy → `run-artifacts/session/` before temp delete
- [x] `rg 'run-artifacts/session' .github/workflows/ai-code-review.yml` — artifact glob still `run-artifacts/**`
- [ ] Manual or post-implement CI: artifact contains `session/diff.json` when analyzers ran (Phase 7)

---

### Phase 6: Evals harness — session dir parity

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | Component and E2E evals seed IPC under a session directory; Task prompt parity tests match SKILL shape (absolute session paths). |

#### Verification

- [x] `npm test -w evals` passes
- [x] `rg '\\.ai-code-review/work' evals/lib` — no remaining production-path assumptions (except changelog/comments if any)
- [x] `securityTaskPrompt(sessionDir)` lines match `SKILL.md` Task prompt **shape** (Read/Write paths absolute)

---

### Phase 7: Docs sweep + full regression

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | Repo docs match new contract; automated tests green; manual validation checklist ready for `/validate`. |

#### Verification

- [x] All automated verification commands pass
- [ ] Manual checklist from spec **Validation checklist** documented as done or filed in Phase 7 PR notes
- [x] Spec 05 acceptance spot-check: emoji blocks and `Analyzers:` / `Validator funnel:` still in skill

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-31 | Initial plan from spec 07 (7 todos, English stdout, ephemeral session, evals parity) |
| 2026-05-31 | Implemented all phases; `npm test -w reviewer-runner` and `npm test -w evals` green |
