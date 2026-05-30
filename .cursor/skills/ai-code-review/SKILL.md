---
name: ai-code-review
description: Review PR-scoped git diffs for obvious bugs and quality issues; write structured findings to .ai-code-review/findings.json. Use when reviewing PR diffs locally or when invoked by reviewer-runner in CI.
---

# AI Code Review

Single-pass code review: **`prepare-diff` → diff summary → heuristic analysis → `.ai-code-review/findings.json`**.

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

## Workflow checklist

1. Run `prepare-diff` (see below) and read the JSON output (stdout or `--output` file).
2. Print the **mandatory diff run summary** to **stdout** (exact format below) using metadata from the script output.
3. If incremental was requested but `metadata.is_incremental === false`, print a separate line: `Warning: full review fallback` plus any `metadata.warnings` entries (each prefixed with `Warning:`).
4. Analyze **only** the per-file diffs in the `prepare-diff` output (changed hunks on the **new** side).
5. Use known-issues JSON (if provided) as hints; do not duplicate existing inline threads at the same `(file, line)`.
6. **Overwrite** `.ai-code-review/findings.json` at the repo root (create `.ai-code-review/` if missing).
7. Confirm the findings file exists on disk before finishing.

## `prepare-diff`

Script path (repo-relative): `.cursor/skills/ai-code-review/scripts/prepare-diff.ts`

```bash
npx tsx .cursor/skills/ai-code-review/scripts/prepare-diff.ts \
  --source <source-ref-or-sha> \
  --target <target-ref> \
  --pr-files <path-to-pr-files-list> \
  [--since-commit <full-sha>] \
  [--output .ai-code-review/prepare-diff.json]
```

- `--since-commit` only when incremental (runner or human supplied `Since commit:`).
- PR file list: one repo-relative path per line (runner writes this in CI).

## Mandatory diff run summary (stdout)

Print **after** `prepare-diff` completes and **before** analyzing code. Values must match `metadata` from the script output.

**Incremental** (`metadata.is_incremental === true`):

```text
Incremental: yes (since <full-sha>)
Diff stats: <n> files, +<added>/-<removed>
Excluded: <files_excluded> files
```

Use `metadata.since_commit` for `<full-sha>`, `metadata.total_files`, `metadata.total_lines_added`, `metadata.total_lines_removed`, `metadata.files_excluded`.

**Full review** (`metadata.is_incremental === false`):

```text
Incremental: no (base <full-sha>)
Diff stats: <n> files, +<added>/-<removed>
Excluded: <files_excluded> files
```

Use `metadata.diff_base` for `<full-sha>`.

Then print any `metadata.warnings` as separate lines: `Warning: <message>`.

## Processing (single pass)

1. Parse each file diff from `prepare-diff` output (files, hunks, line numbers on the **new** side).
2. Scan changed hunks for **obvious** issues (heuristic, not exhaustive):
   - Possible bugs (null/undefined misuse, wrong comparisons, race-prone patterns)
   - Security smells (secrets in code, unsafe `eval`, injection surfaces)
   - Missing error handling on risky operations
   - Confusing naming or misleading types
   - Large or risky changes without tests
3. For each issue you would flag on a real PR, add one entry to `findings[]`.
4. **Overwrite** `.ai-code-review/findings.json`.

## Output contract

**Path:** `.ai-code-review/findings.json` (repo root)

**Schema:**

```json
{
  "version": "1",
  "findings": [
    {
      "severity": "info",
      "file": "path/from/repo/root.ts",
      "line": 42,
      "problem": "what is wrong",
      "suggestion": "how to fix it"
    }
  ]
}
```

| Field | Rules |
|-------|--------|
| `version` | Must be `"1"` |
| `severity` | One of `info`, `warning`, `error` |
| `file` | Repo-relative path; must appear in the reviewable `prepare-diff` file set |
| `line` | **Required** for inline PR comments — line on the **new** file version. Omit if you cannot anchor. |
| `problem` | Short, specific description |
| `suggestion` | Actionable fix |

**Empty review:** `{ "version": "1", "findings": [] }`.

**Do not** emit review content only in chat; the runner reads the **file**, not stdout.

### Example (one finding)

```json
{
  "version": "1",
  "findings": [
    {
      "severity": "warning",
      "file": ".cursor/skills/ai-code-review/examples/smoke-target.ts",
      "line": 3,
      "problem": "Division by zero when value is 0.",
      "suggestion": "Guard with `if (value === 0) return 0` or throw a clear error."
    }
  ]
}
```

## GitHub comment shape (for consistency)

The runner maps each finding with `file` + `line` to an inline PR comment:

```markdown
*Problem*
{problem}

Suggested fix: *{suggestion}*
```

You do not post to GitHub; only write the JSON file.

## Out of scope

- Subagents, multi-pass review
- `evals/` harness
- Posting GitHub comments directly
- External tracking state (runner owns PR tracking comment)
