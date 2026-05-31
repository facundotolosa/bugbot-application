# Review progress UX (local todos + English stdout + ephemeral work files)

## Product summary

Developers running **ai-code-review** locally in Cursor and operators watching **GitHub Actions** logs should always know **what phase is running**, in **plain English**, without digging through `.ai-code-review/work/` clutter.

Success means three outcomes: (1) **mandatory TodoWrite** progress in the IDE (fixed 7-step checklist, state machine, first tool call of the run); (2) **short English status lines** on stdout at every orchestrator phase (same lines in CI and local, forwarded as `[orchestrator]` by `reviewer-runner`); (3) **inter-agent IPC JSON** written under an **ephemeral session directory** (OS temp), with only **durable** outputs left under `.ai-code-review/` (`findings.json`, `validator-summary.json`, runner inputs, optional `run-artifacts/` from spec 05).

This spec **extends** [05-pipeline-observability](../05-pipeline-observability/spec.md) (wrapper logger, emoji blocks, stream filtering). It does **not** change analyzer heuristics, invocation criteria, validator funnel rules, or GitHub posting semantics.

## Scope

### In scope

| # | Area | Deliverable |
|---|------|-------------|
| 1 | **Mandatory TodoWrite (local IDE)** | `SKILL.md` + `references/progress-todos.md`: Step 0 before any other tool; exactly **7** items with stable `id` + fixed `content` strings; state machine; `merge: false` init, `merge: true` updates at **start** of each skill step; anti-patterns documented. |
| 2 | **English-only orchestrator narration** | Orchestrator **must** emit all prescribed status + emoji + machine lines in **English** (assistant message text → `[orchestrator]` in CI), regardless of human chat language. Normative in `SKILL.md` only — **not** duplicated in `buildReviewPrompt`. Subagent finding text remains English (existing analyzer docs). |
| 3 | **Canonical status lines** | Fixed one-sentence lines **before** each phase (prepare-diff, analyzer launch, collect, validator, skip-validator, close). No Spanish, no tool names, no “Let me…”. Table in **Behavior** below becomes normative in `SKILL.md`. |
| 4 | **Ephemeral session directory** | Orchestrator creates `mkdtemp`-style dir under OS temp (e.g. `$TMPDIR/ai-code-review-<random>/`). All analyzer/validator IPC files live there. Task prompts use **session paths**, not `.ai-code-review/work/`. |
| 5 | **Durable `.ai-code-review/` layout** | Only: `findings.json`, `validator-summary.json`, `known-issues.json`, `pr-files.txt` (runner), optional `prepare-diff.json` if human passes `--output`, `run-artifacts/**` (spec 05). **Remove** persistent `work/` from skill contract. |
| 6 | **Session lifecycle** | Create session dir at start of orchestration; write `session-manifest.json` inside it (paths map). Before deleting temp: **copy** session tree → `.ai-code-review/run-artifacts/session/` (complements spec 05 SDK trace — no overlap). Then **best-effort `rm -rf`** temp dir. Crashed runs may leave orphans under `$TMPDIR`. |
| 7 | **Subagent + skill path updates** | `.cursor/agents/ai-code-review-*.md`, `SKILL.md` Task prompt examples, `merge-findings` / `validator-output` inline scripts: parameterized paths or manifest-relative paths. |
| 8 | **Evals / harness** | Update golden paths in `evals/` cases that assert on `work/*` if any; document temp-dir pattern for harness worktrees. |
| 9 | **CI session snapshot** | Orchestrator copies `$TMPDIR` session into `run-artifacts/session/` before cleanup so existing `upload-artifact` (`run-artifacts/**`) includes IPC JSON without a new workflow step or `AI_CODE_REVIEW_SESSION_DIR` in Actions. |
| 10 | **Tests** | Unit test that skill documents 7 todo ids + canonical English lines (`skill-contract.test.ts`); no regression on `reviewer-runner` stream tests from spec 05. |

### Out of scope

| Item | Notes |
|------|--------|
| JIRA / ticket context todo (`jira_ctx`) | Not in this repository. |
| TodoWrite in CI logs | Todos are **IDE-only**; never print TodoWrite to stdout (spec 05). |
| Changing wrapper ANSI design | Owned by spec 05. |
| Subagent stdout narration | Subagents still reply `Done` only. |
| New analyzers or validator phases | Specs 03–04. |
| Auto-translating finding `issue`/`suggestion` | Analyzers already English; no i18n layer. |
| Committing `.ai-code-review/` contents | Remains gitignored. |
| **`buildReviewPrompt` orchestration / narration rules** | Runner passes PR parameters and paths only; execution pacing and English lines live in `SKILL.md` (see specs 01, 05). |

## Behavior

### Three UX surfaces

| Mechanism | Where | Audience |
|-----------|--------|----------|
| **TodoWrite (7 steps)** | Cursor agent executing skill | Developer locally |
| **English status + emoji blocks** | Orchestrator stdout → `[orchestrator]` stream | CI + local terminal |
| **Wrapper `logger.*` + sub-agent lines** | `reviewer-runner` | CI + local terminal |
| **Ephemeral session JSON** | `$TMPDIR/ai-code-review-*` | Orchestrator + subagents only |
| **Durable report** | `.ai-code-review/findings.json` | Runner + human |

### Language rules

1. **Orchestrator narration (assistant text → `[orchestrator]` in CI):** English only — status sentences, emoji block labels, `Warning:`, `Analyzers:`, `Validator funnel:`, `Report written to:`.
2. **IDE chat with human:** May stay Spanish per [concise-responses](../../conventions/concise-responses.md); **do not** mix Spanish into narration lines.
3. **Finding bodies:** English (`issue`, `suggestion`).

### Mandatory TodoWrite — initialization (Step 0)

**First tool call** of the orchestration turn: `TodoWrite` with `merge: false`, exactly **7** items:

| `id` | `content` (fixed string) | Initial `status` |
|------|--------------------------|------------------|
| `prereq` | `1- Prerequisites check` | `in_progress` |
| `metadata` | `2- Extract PR metadata` | `pending` |
| `diff` | `3- Obtain and prepare diff` | `pending` |
| `analyzers` | `4- Run analyzer sub-agents` | `pending` |
| `collect` | `5- Collect results` | `pending` |
| `validate` | `6- Run validator` | `pending` |
| `report` | `7- Generate JSON report` | `pending` |

Rules:

- Prefix `1-` … `7-` in `content`; **never** change `content` on `merge: true` — only `status`.
- At most **one** `in_progress` at a time (no `jira_ctx` parallel exception in this repo).
- **No** extra todos (per batch, per analyzer, per validator phase).
- Mark `report` `completed` only after `findings.json` exists **and** final stdout line printed.

### Todo state machine (skill step → todo)

| Skill step | At step **start** (TodoWrite `merge: true`) |
|------------|-----------------------------------------------|
| 0 | Create list (above) |
| 1 Prerequisites | `prereq` → `in_progress` (already from step 0) |
| 2 After prepare-diff metadata read | `prereq` → `completed`; `metadata` → `in_progress` |
| 2 End (before diff work) | `metadata` → `completed` |
| 3 Diff + analyzer selection | `diff` → `in_progress` |
| 4 Launch analyzer Tasks | `diff` → `completed`; `analyzers` → `in_progress` |
| 5 Collect analyzer files | `analyzers` → `completed`; `collect` → `in_progress` |
| 6 Validator (or skip) | `collect` → `completed`; `validate` → `in_progress` |
| 7 Report + stdout close | `validate` → `completed`; `report` → `in_progress` |
| 7 End | `report` → `completed` |

Long-running Step 4: keep `analyzers` `in_progress` until Step 5 starts (do not complete early when Tasks return).

Validator skip (0 raw findings): still run Step 6 todos (`validate` in_progress → completed) before Step 7.

### Canonical English stdout lines (before each phase)

Print **one sentence** immediately **before** the action (then emoji blocks where already required by spec 05):

| When | Line (exact wording unless noted) |
|------|-----------------------------------|
| Start | `I'll run the ai-code-review skill with the PR parameters from the prompt.` |
| After `prepare-diff` | `Diff ready; selecting analyzers.` (then 📋 + 📊 blocks) |
| After `Analyzers:` line, before Tasks | `Launching selected analyzer sub-agents in parallel.` (or name selected set if only one) |
| After analyzer files read | `Collected analyzer output; merging raw findings.` |
| Before validator Task | `Running validator on raw findings.` |
| Raw empty, skip validator | `All analyzers returned no findings; skipping validator.` |
| After validator or skip | Existing collect/validator emoji lines + consolidated close (spec 05) |
| Final | `Report written to: .ai-code-review/findings.json` (unchanged) |

**Anti-patterns:** Spanish status text; narrating tool calls (“Running npx tsx prepare-diff”); dumping paths to session temp on stdout (except `Warning:`).

### Ephemeral session directory

**Create** at orchestration start (after Step 0 todos):

```text
$TMPDIR/ai-code-review-<random>/
  session-manifest.json   # { "sessionDir", "diff", "security", "performance", "raw", "validatorOut", "validatorSummary" }
  diff.json
  security-findings.json
  performance-findings.json
  raw-findings.json
  validator-output.json
  validator-summary.json
```

**Task prompts (two/three lines)** use manifest paths, e.g.:

```text
Read diff from: /var/folders/.../ai-code-review-abc/diff.json
Write findings to: /var/folders/.../ai-code-review-abc/security-findings.json
```

**Final mapping:** validator output → `.ai-code-review/findings.json` + `.ai-code-review/validator-summary.json` (durable copy of `filter_summary`; also write under session dir during the run).

**Cleanup:** After `findings.json` + `validator-summary.json` are written: copy session dir → `.ai-code-review/run-artifacts/session/` (for CI artifact upload per spec 05), then delete the temp directory. On validator abort: copy session snapshot if possible, skip temp delete, log one English `Warning: session files kept at <path>`.

### Durable `.ai-code-review/` (post-change)

| Path | Role |
|------|------|
| `findings.json` | Final v2 report (runner input) |
| `validator-summary.json` | Copy of validator `filter_summary` (or zeroed on skip) for local debug |
| `known-issues.json` | Runner-built validator input |
| `pr-files.txt` | Runner-built PR file list |
| `prepare-diff.json` | Optional human `--output` |
| `run-artifacts/**` | Spec 05 post-mortem (unchanged) |
| ~~`work/**`~~ | **Removed** from contract |

## API / events

| Surface | Contract |
|---------|----------|
| **Skill** | Step 0 todos; English narration table; session dir + manifest; updated file contract and Task prompt examples. |
| **`buildReviewPrompt`** | PR parameters + review run paths only (no narration/orchestration instructions). Does not create session dir (orchestrator does). |
| **Env (optional)** | `AI_CODE_REVIEW_SESSION_DIR` — absolute path; if set, orchestrator uses it instead of creating a new temp dir. |
| **Subagents** | Read/write paths **only** from Task prompt; manifest schema version `"1"`. |
| **CI** | No new workflow env or artifact name. Orchestrator adds `run-artifacts/session/**` before temp cleanup; existing `upload-artifact` path `run-artifacts/**` picks it up. |

## Acceptance criteria

- [x] Running the skill locally shows **7 todos** on the first tool call; contents match the table above; no extra todo items appear during the run.
- [x] Todo states follow the state machine (only one `in_progress` at a time).
- [x] A full local or CI run prints **only English** orchestrator narration lines (no Spanish in `[orchestrator]` stream).
- [x] After a successful run, `.ai-code-review/` contains **no** `work/` tree; `findings.json` exists.
- [x] During the run, analyzer/validator IPC files exist under a temp session path, not under `.ai-code-review/work/`.
- [x] Task prompts in a captured CI run (from `run-artifacts/orchestrator.json`) reference session temp paths for diff/findings I/O.
- [x] After success, temp session dir is removed and `.ai-code-review/run-artifacts/session/` contains `diff.json`, analyzer outputs, `raw-findings.json`, and validator files (when run).
- [x] Downloaded CI artifact `ai-review-run-artifacts` includes both SDK trace (`orchestrator.json`, `subagents/`) and `session/` IPC (no duplicate of `findings.json` required in `session/` if already at repo root — copy is fine for self-contained artifact).
- [x] Spec 05 behaviors preserved: emoji blocks, `Analyzers:` / `Validator funnel:` lines, `[orchestrator]` prefix, no SDK noise on stdout.
- [x] `npm test -w reviewer-runner` passes; eval cases updated if they referenced `work/`.

## Validation checklist

- [x] Acceptance criteria above are met
- [x] `npm test` passes (`reviewer-runner` at minimum)
- [x] Manual local skill run: todos visible + English `[orchestrator]` lines in terminal when using `npm run review -w reviewer-runner`
- [x] Manual: list `.ai-code-review/` after success — no `work/` subdirectory
- [x] `references/progress-todos.md` matches skill Step 0 / state machine in `SKILL.md`
- [x] No open questions block release (or deferred with owner)

## Open questions

| # | Question | Status | Answer / decision |
|---|----------|--------|-------------------|
| 1 | Session dir: **OS `$TMPDIR`** vs **`.ai-code-review/.session/<id>`**? | Resolved | **`$TMPDIR`** — `mkdtemp` prefix `ai-code-review-`; not under repo. |
| 2 | Who creates the session dir — **orchestrator** vs **reviewer-runner**? | Resolved | **Orchestrator** creates via `mkdtemp` at skill start. If `AI_CODE_REVIEW_SESSION_DIR` is set, reuse it (optional runner/eval hook). Runner does not require pre-creation. |
| 3 | Mirror `validator-summary.json` under `.ai-code-review/` for local debugging? | Resolved | **Yes** — copy `filter_summary` to `.ai-code-review/validator-summary.json` after validator (or zeroed summary on skip). Session copy optional; durable path for local inspection. |
| 4 | Include session IPC in CI debug artifacts? | Resolved | **Yes** — copy temp session → `run-artifacts/session/` before `rm -rf`; reuses existing `upload-artifact`. Does **not** overlap spec 05 (`orchestrator.json` = SDK trace; `session/` = pipeline JSON). No workflow `AI_CODE_REVIEW_SESSION_DIR` required. |

_Status: `Open` · `Deferred` · `Resolved`_

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-31 | brainstorm | Initial draft: 7-step todos; English stdout; ephemeral session IPC; durable outputs under `.ai-code-review/` |
| 2026-05-31 | Human | Q1–Q4 resolved (`$TMPDIR`, orchestrator creates session, mirror `validator-summary.json`, session snapshot under `run-artifacts/session/`). |
| 2026-05-31 | implement | Skill Step 0 todos; English stdout table; session IPC + lifecycle; evals `session.ts`; `skill-contract.test.ts`. |
| 2026-05-31 | validate | Human sign-off: AC + checklist complete; removed `buildReviewPrompt` English narration AC (skill-only). |
