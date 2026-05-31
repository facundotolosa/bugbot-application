# Progress todos (IDE only)

Mandatory **TodoWrite** checklist for local orchestration.

**Step 0 init:** copy the JSON block in [SKILL.md Step 0](../SKILL.md#step-0--todowrite-mandatory-ide-only) verbatim — do not paraphrase `content`. This file documents the state machine only.

## Initialization (Step 0 — first tool call)

`TodoWrite` with `merge: false`, exactly **7** items (must match SKILL.md JSON):

| `id` | `content` (fixed — never change on merge) | Initial `status` |
|------|-------------------------------------------|------------------|
| `prereq` | `1- Prerequisites check` | `in_progress` |
| `metadata` | `2- Extract PR metadata` | `pending` |
| `diff` | `3- Obtain and prepare diff` | `pending` |
| `analyzers` | `4- Run analyzer sub-agents` | `pending` |
| `collect` | `5- Collect results` | `pending` |
| `validate` | `6- Run validator` | `pending` |
| `report` | `7- Generate JSON report` | `pending` |

## State machine (skill step → todo at step **start**)

| Skill step | TodoWrite (`merge: true`) |
|------------|---------------------------|
| 0 | Create list (above) |
| 1 Prerequisites | `prereq` → `in_progress` (already from step 0) |
| 2 After `prepare-diff` metadata read | `prereq` → `completed`; `metadata` → `in_progress` |
| 2 End (before diff / session work) | `metadata` → `completed` |
| 3 Diff + analyzer selection | `diff` → `in_progress` |
| 4 Launch analyzer Tasks | `diff` → `completed`; `analyzers` → `in_progress` |
| 5 Collect analyzer files | `analyzers` → `completed`; `collect` → `in_progress` |
| 6 Validator (or skip) | `collect` → `completed`; `validate` → `in_progress` |
| 7 Report + narration close | `validate` → `completed`; `report` → `in_progress` |
| 7 End | `report` → `completed` (only after `findings.json` exists **and** final narration line in assistant text) |

## Rules

- Prefix `1-` … `7-` in `content`; on `merge: true` update **only** `status`, never `content`.
- At most **one** `in_progress` at a time.
- **No** extra todos (per batch, per analyzer, per validator phase).
- Step 4: keep `analyzers` `in_progress` until step 5 starts (do not complete when Tasks return early).
- Validator skip (0 raw findings): still run step 6 todos (`validate` in_progress → completed) before step 7.

## Anti-patterns

- Paraphrased `content` on Step 0 init (e.g. “Verify inputs and create session directory” instead of `1- Prerequisites check`)
- Reading this file before Step 0 if it delays the first `TodoWrite` call (use SKILL.md JSON first)
- Extra todo items beyond the seven above
- Changing `content` strings on `merge: true`
- Two todos `in_progress` at once
- Printing TodoWrite text in orchestrator narration (IDE only; spec 05)
- Using Shell (`echo`, `node -e` + `console.log`) solely to emit progress lines — use assistant message text instead
- Marking `report` completed before `findings.json` and the final `Report written to:` narration line
