---
name: ai-code-review
description: Orchestrate PR-scoped diff review via security/performance subagents and validator funnel; write schema v2 findings to .ai-code-review/findings.json. Use when reviewing PR diffs locally or when invoked by reviewer-runner in CI.
---

# AI Code Review (orchestrator)

You are the **orchestrator**. You do **not** perform heuristic analysis yourself. You coordinate:

**`prepare-diff` → ephemeral session IPC → invocation criteria → parallel analyzer Tasks → merge raw → validator Task → `.ai-code-review/findings.json` (v2)**

Subagent intelligence lives in `.cursor/agents/ai-code-review-{security,performance,validator}.md`. Analyzer Task prompts are **two lines only** (read path + write path). The validator Task prompt is **three lines only** (raw findings, known issues, output path).

## Architecture

```mermaid
flowchart TB
  PD[prepare-diff]
  IC[invocation criteria]
  SEC[security-analyzer Task]
  PERF[performance-analyzer Task]
  RAW[merge raw findings]
  VAL[validator Task]
  OUT[findings.json v2]

  PD --> IC
  PD -->|session/diff.json| SEC
  PD -->|session/diff.json| PERF
  IC --> SEC
  IC --> PERF
  SEC --> RAW
  PERF --> RAW
  RAW -->|findings.length > 0| VAL
  RAW -->|empty| OUT
  VAL --> OUT
```

| Layer | Responsibility |
|-------|----------------|
| **You (orchestrator)** | Step 0 TodoWrite; session dir + manifest; `prepare-diff`; English stdout blocks; select analyzers; launch analyzer Tasks; merge **raw**; launch validator when non-empty; map validated output → v2; fail closed on validator errors; snapshot session → `run-artifacts/session/` |
| **Analyzer subagents** | Read diff JSON; domain analysis; write intermediate JSON; reply `Done` |
| **Validator subagent** | Five-phase funnel on raw findings; read reference docs; write `validator-output.json`; reply `Done` |
| **reviewer-runner** | Incremental scope, tracking, build `known-issues.json`, invoke agent, validate v2, **`filterFindingsForPost` = PR file scope only**, post inline comments |

You do **not** filter severity, dedupe findings, or run verification yourself — the validator owns the funnel after merge.

## Step 0 — TodoWrite (mandatory, IDE only)

**First tool call** of the orchestration turn — before **any** other tool (including `prepare-diff`, Bash, Read, or Task).

Full checklist and state machine: [references/progress-todos.md](references/progress-todos.md)

1. `TodoWrite` with `merge: false`, exactly **7** items (`prereq` … `report`) with fixed `content` strings from the reference table; `prereq` starts `in_progress`, others `pending`.
2. At the **start** of each workflow step below, `TodoWrite` with `merge: true` — update **only** `status` per the state machine (never change `content`).
3. Mark `report` → `completed` only after `.ai-code-review/findings.json` exists **and** the final stdout line is printed.
4. **Never** print TodoWrite lines to stdout.

## Session directory

Create immediately after Step 0 (before `prepare-diff`):

```bash
npx tsx -e "
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const sessionDir = process.env.AI_CODE_REVIEW_SESSION_DIR
  ? process.env.AI_CODE_REVIEW_SESSION_DIR
  : mkdtempSync(join(tmpdir(), 'ai-code-review-'));
const manifest = {
  version: '1',
  sessionDir,
  diff: join(sessionDir, 'diff.json'),
  security: join(sessionDir, 'security-findings.json'),
  performance: join(sessionDir, 'performance-findings.json'),
  raw: join(sessionDir, 'raw-findings.json'),
  validatorOut: join(sessionDir, 'validator-output.json'),
  validatorSummary: join(sessionDir, 'validator-summary.json'),
};
writeFileSync(join(sessionDir, 'session-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(sessionDir);
"
```

- If `AI_CODE_REVIEW_SESSION_DIR` is set (absolute path), **reuse** it; do not create a new temp dir.
- All analyzer/validator IPC files live under `sessionDir` only — **not** under `.ai-code-review/work/`.
- Read paths from `session-manifest.json` for Task prompts and inline scripts.

## Language rules

| Surface | Language |
|---------|----------|
| **Stdout** (status lines, emoji labels, `Warning:`, `Analyzers:`, `Validator funnel:`, `Report written to:`) | **English only** — short, one sentence per step |
| **IDE chat with human** | May be Spanish per project conventions; **do not** mix Spanish into stdout |
| **Finding bodies** (`issue`, `suggestion`) | English |

**Anti-patterns on stdout:** Spanish status text; narrating tool calls (“Running npx tsx prepare-diff”); dumping session temp paths (except `Warning:` lines).

## Inputs

| Input | Source | Required |
|-------|--------|----------|
| Source ref / head SHA | Runner prompt or local (`HEAD`, branch, or commit) | Yes |
| Target ref / base branch | Runner prompt or local (e.g. `main`) | Yes |
| PR file list | Path to newline-separated paths (`--pr-files` for `prepare-diff`) | Yes in CI; recommended locally |
| Known issues JSON | Path to `{ "issues": [{ "file", "line", "message" }] }` | Optional (CI supplies; may be `[]`) |
| `Since commit: <sha>` | Runner (incremental) or human in local invocation | Optional — enables incremental diff |
| Repository root (`cwd`) | Workspace / runner | Yes |
| PR title | Runner / human | No |

**Local incremental:** only when the human supplies `Since commit: <full-sha>` in the prompt. Without it, run a **full** review from merge-base.

**Do not** paste a raw full-PR `git diff` as the primary input; use `prepare-diff` so scope, ignores, and metadata stay consistent with CI.

## Progress visibility

The runner forwards **every line you print to stdout** with an `[orchestrator]` prefix as it streams. Operators must see **what you are doing in order**, not only a dump at the end.

**IDE progress:** see Step 0 — mandatory TodoWrite; never print todo text to stdout.

**Print short English status lines (one sentence each) immediately before the action:**

| When | Line (exact wording) |
|------|------------------------|
| Start | `I'll run the ai-code-review skill with the PR parameters from the prompt.` |
| After `prepare-diff` | Print **📋** and **📊** blocks, then `Diff ready; selecting analyzers.` |
| After `Analyzers:` line, before Tasks | `Launching selected analyzer sub-agents in parallel.` (or name the selected set if only one) |
| After analyzer files read | `Collected analyzer output; merging raw findings.` |
| Before validator Task | `Running validator on raw findings.` |
| Raw empty, skip validator | `All analyzers returned no findings; skipping validator.` |
| After validator or skip | Collect/validator emoji lines + consolidated close (spec 05) |
| Final | `Report written to: .ai-code-review/findings.json` |

- Tool work stays silent (no tool names, Task prompts, or bash in stdout).
- `Warning:` / `⚠️` lines when `metadata.warnings` or incremental fallback apply.

**Do not print to stdout:** Task prompts, `tool_use` narration, shell one-liners, env dumps, session paths (except `Warning:`), or extra content on the final path line.

## Workflow checklist

1. **Step 0:** TodoWrite init (see above).
2. **Session:** Create or reuse session dir; write `session-manifest.json`.
3. **Todo:** `prereq` in_progress (from step 0).
4. Run `prepare-diff` (see below); read JSON from stdout or `--output` file.
5. **Todo:** `prereq` completed; `metadata` in_progress → then completed after metadata read.
6. **Immediately** print **📋 PR Metadata** and **📊 Diff stats** blocks — then `Diff ready; selecting analyzers.`
7. If incremental was requested but `metadata.is_incremental === false`, print `Warning: full review fallback` plus each `metadata.warnings` entry (prefix `Warning:`).
8. **Todo:** `diff` in_progress. **Write** `{sessionDir}/diff.json` with the same shape as `prepare-diff` output (`metadata` + `files[]`).
9. **Select analyzers** (see [Invocation criteria](references/invocation-criteria.md)) — apply the same rules as `scripts/select-analyzers.ts`, or run:

   ```bash
   SESSION=$(node -p "JSON.parse(require('fs').readFileSync(process.env.AI_CODE_REVIEW_SESSION_DIR + '/session-manifest.json','utf8')).sessionDir")
   npx tsx -e "
   import { readFileSync } from 'node:fs';
   import { selectAnalyzers } from './.cursor/skills/ai-code-review/scripts/select-analyzers.ts';
   const manifest = JSON.parse(readFileSync(process.env.AI_CODE_REVIEW_SESSION_DIR + '/session-manifest.json','utf8'));
   const diff = JSON.parse(readFileSync(manifest.diff,'utf8'));
   console.log(selectAnalyzers(diff.files ?? []));
   "
   ```

10. **Log analyzers** to stdout (exactly one line):
    - Both: `Analyzers: security, performance`
    - Performance skipped: `Analyzers: security (skipped: performance)`
11. Print `Launching selected analyzer sub-agents in parallel.` (or name subset) — then **Todo:** `diff` completed; `analyzers` in_progress.
12. **Launch analyzer Tasks** in **one parallel batch** for each selected key. Do **not** launch Tasks for skipped analyzers. Keep `analyzers` in_progress until step 13 starts.
13. **Todo:** `analyzers` completed; `collect` in_progress. Print `Collected analyzer output; merging raw findings.`
14. **Collect** each analyzer output file (manifest paths). On missing file or invalid JSON: **retry once** with the same two-line prompt; on second failure use `{ "analyzer": "<key>", "findings": [] }`.
15. **Merge raw** — write `{sessionDir}/raw-findings.json` (v2 shape via `mergeAnalyzerOutputs`).
16. **Validator path:**
    - If `raw_findings.length === 0`: print `All analyzers returned no findings; skipping validator.`; write `{ "version": "2", "findings": [] }` to `.ai-code-review/findings.json`; write `.ai-code-review/validator-summary.json` from `zeroedFilterSummary()`; **do not** launch validator Task.
    - Else: print `Running validator on raw findings.`; **Todo:** `collect` completed; `validate` in_progress. Ensure `known-issues.json` exists. Launch **one** validator Task (**no retry**).
17. **Collect validator output** — read manifest `validatorOut` only; validate with `parseValidatorOutput`; on missing/invalid → **abort** (do not write unvalidated `findings.json`). Print `Warning: session files kept at <sessionDir>`; snapshot session if possible; **do not** delete temp.
18. **Map** validated output → `.ai-code-review/findings.json` (v2); copy `filter_summary` → `.ai-code-review/validator-summary.json` and session `validatorSummary`.
19. **Todo:** `validate` completed; `report` in_progress.
20. Print **one stdout line**: `Validator funnel: <raw_input> → <final_output>` (from `filter_summary`).
21. Print the **consolidated final block** (repeat 📋 📊 🔬 📥 ⏭️/✅ in order, then 🎯 severity counts from **final** `findings.json`).
22. Print **exactly one** closing line: `Report written to: .ai-code-review/findings.json`
23. **Todo:** `report` completed.
24. **Session snapshot & cleanup:** Ensure `.ai-code-review/run-artifacts/` exists; copy session dir → `.ai-code-review/run-artifacts/session/`; best-effort `rm -rf` on temp session dir (skip delete on validator abort).

## `prepare-diff`

Script: `.cursor/skills/ai-code-review/scripts/prepare-diff.ts`

```bash
npx tsx .cursor/skills/ai-code-review/scripts/prepare-diff.ts \
  --source <source-ref-or-sha> \
  --target <target-ref> \
  --pr-files <path-to-pr-files-list> \
  [--since-commit <full-sha>] \
  [--output .ai-code-review/prepare-diff.json]
```

## Stdout emoji blocks (fixed templates)

Print values from `prepare-diff` `metadata` / session files. Machine lines `Analyzers:` and `Validator funnel:` stay **plain** (no emoji).

| Step | Block |
|------|--------|
| Metadata | `📋 PR Metadata:` — source/target branch, incremental yes/no + since SHA |
| Diff | `📊 Diff stats:` — file count, +/- lines, excluded count; label full vs incremental |
| Analyzers | `🔬 Analyzers:` — selected list and `(skipped: …)` when applicable |
| Collect | `📥 Collected results:` — raw count, categories from analyzers present |
| Validator skip | `⏭️ Validator skipped: …` when raw empty |
| Validator done | `✅ Validator complete: {raw} raw → {final} validated` |
| Close | Repeat 📋 📊 🔬 📥 ✅ in order, then `🎯 Review complete:` severity breakdown from **final** `findings.json` |

## Invocation criteria

Full rules: [references/invocation-criteria.md](references/invocation-criteria.md)

| Analyzer | When |
|----------|------|
| **security** | **Always** |
| **performance** | Any path/diff heuristic matches (see reference) |

## File contract

### Durable (`.ai-code-review/` at repo root)

| Path | Role |
|------|------|
| `findings.json` | Final v2 report (runner input) |
| `validator-summary.json` | Copy of `filter_summary` (or zeroed on skip) |
| `known-issues.json` | Runner-built; validator input only |
| `pr-files.txt` | Runner-built PR file list |
| `prepare-diff.json` | Optional; `--output` from `prepare-diff` |
| `run-artifacts/**` | SDK trace + `session/` IPC snapshot (spec 05) |

### Ephemeral (session dir under `$TMPDIR` or `AI_CODE_REVIEW_SESSION_DIR`)

| File | Role |
|------|------|
| `session-manifest.json` | Path map (schema version `"1"`) |
| `diff.json` | Orchestrator → analyzers |
| `security-findings.json` | Security subagent output |
| `performance-findings.json` | Performance subagent output |
| `raw-findings.json` | Merged pre-validation |
| `validator-output.json` | Validator subagent output |
| `validator-summary.json` | In-session copy of `filter_summary` |

**Removed:** persistent `.ai-code-review/work/` — do not create it.

## Analyzer Tasks

Use the **Task** tool. `subagent_type` must match agent frontmatter `name` exactly.

| Analyzer | `subagent_type` | Output (manifest key) |
|----------|-----------------|------------------------|
| security | `ai-code-review-security-analyzer` | `security` |
| performance | `ai-code-review-performance-analyzer` | `performance` |

### Task prompt (exactly two lines — use absolute paths from manifest)

Security:

```text
Read diff from: /var/folders/.../ai-code-review-abc/diff.json
Write findings to: /var/folders/.../ai-code-review-abc/security-findings.json
```

Performance:

```text
Read diff from: /var/folders/.../ai-code-review-abc/diff.json
Write findings to: /var/folders/.../ai-code-review-abc/performance-findings.json
```

**Do not** trust Task return text for findings. Only read output files; validate JSON.

### Collect and retry (analyzers only)

1. Read manifest output path after Task completes.
2. If missing or invalid JSON → retry **once** with the **same** two-line prompt.
3. Second failure → treat as `{ "analyzer": "<key>", "findings": [] }`.

### Merge raw

Build outputs in order: security (if run), then performance (if run). Write to manifest `raw`:

```bash
npx tsx -e "
import { readFileSync, writeFileSync } from 'node:fs';
import { mergeAnalyzerOutputs } from './.cursor/skills/ai-code-review/scripts/merge-findings.ts';
const m = JSON.parse(readFileSync(process.env.AI_CODE_REVIEW_SESSION_DIR + '/session-manifest.json','utf8'));
const read = (p) => { try { return JSON.parse(readFileSync(p,'utf8')); } catch { return null; } };
const sec = read(m.security) ?? { analyzer: 'security', findings: [] };
const perf = read(m.performance) ?? { analyzer: 'performance', findings: [] };
writeFileSync(m.raw, JSON.stringify(mergeAnalyzerOutputs([sec, perf]), null, 2));
"
```

## Validator Task

Launch **only** when `raw-findings.json` has `findings.length > 0`. **No retry** on failure.

| Validator | `subagent_type` | Output (manifest key) |
|-----------|-----------------|------------------------|
| validator | `ai-code-review-validator` | `validatorOut` |

### Task prompt (exactly three lines — absolute paths)

```text
Read findings from: /var/folders/.../ai-code-review-abc/raw-findings.json
Read known issues from: /abs/path/to/repo/.ai-code-review/known-issues.json
Write output to: /var/folders/.../ai-code-review-abc/validator-output.json
```

### Collect validator output

1. Read manifest `validatorOut` after Task completes.
2. Parse with `parseValidatorOutput` (see helper below).
3. If missing or invalid → **abort**. Do **not** write `findings.json` from raw merge. Do **not** retry.

### Map to final report

```bash
npx tsx -e "
import { readFileSync, writeFileSync } from 'node:fs';
import { parseValidatorOutput, mapValidatorToFindingsReport, zeroedFilterSummary } from './.cursor/skills/ai-code-review/scripts/validator-output.ts';
const m = JSON.parse(readFileSync(process.env.AI_CODE_REVIEW_SESSION_DIR + '/session-manifest.json','utf8'));
const raw = JSON.parse(readFileSync(m.raw,'utf8'));
if (!raw.findings?.length) {
  writeFileSync('.ai-code-review/findings.json', JSON.stringify({ version: '2', findings: [] }, null, 2));
  writeFileSync('.ai-code-review/validator-summary.json', JSON.stringify(zeroedFilterSummary(), null, 2));
  console.log('Validator funnel: 0 → 0');
} else {
  const out = parseValidatorOutput(JSON.parse(readFileSync(m.validatorOut,'utf8')));
  writeFileSync('.ai-code-review/findings.json', JSON.stringify(mapValidatorToFindingsReport(out), null, 2));
  writeFileSync('.ai-code-review/validator-summary.json', JSON.stringify(out.filter_summary, null, 2));
  writeFileSync(m.validatorSummary, JSON.stringify(out.filter_summary, null, 2));
  console.log('Validator funnel: ' + out.filter_summary.raw_input + ' → ' + out.filter_summary.final_output);
}
"
```

## Output contract (final report — schema v2)

**Path:** `.ai-code-review/findings.json`

```json
{
  "version": "2",
  "findings": [
    {
      "analyzer": "security",
      "severity": "major",
      "file": "path/from/repo/root.ts",
      "line": 42,
      "issue": "what is wrong",
      "suggestion": "how to fix it"
    }
  ]
}
```

| Field | Rules |
|-------|--------|
| `version` | Must be `"2"` |
| `analyzer` | `security` \| `performance` on each finding |
| `severity` | `critical` \| `major` \| `minor` \| `enhancement` |
| `file` | Repo-relative path from reviewable diff set |
| `line` | Required for inline PR comments (new-file line number) |
| `issue` / `suggestion` | Non-empty strings |

**Empty review:** `{ "version": "2", "findings": [] }`.

**Do not** emit findings only in chat. **Do not** dump merged JSON in chat.

Example: [examples/findings.sample.json](examples/findings.sample.json)

## Known issues

The runner builds `.ai-code-review/known-issues.json` from existing PR inline comments. Pass the path to the validator Task prompt only.

- **Do not** filter or dedupe in the orchestrator or analyzer subagents.
- **Do not** dedupe at merge — cross-analyzer dedup is validator Phase 1.
- Known-issue skip is validator Phase 3.
- The runner's `filterFindingsForPost` drops findings whose `file` is **outside the PR file list** only (not known-issues dedup at post time).

## GitHub posting (runner-owned)

The runner formats inline comments (analyzer title + severity emoji + suggestion). Subagents and you write **JSON only**.

## Out of scope

- Multi-batch `batch-{i}.json` for large PRs
- Analyzers other than `security` and `performance`
- Automatic **retry** of validator Task (analyzers: one retry only)
- `evals/` harness
- Posting GitHub comments directly
- External tracking state (runner owns PR tracking comment)
- Ticket cross-reference, `codebase-patterns.md`, `category` on findings
